import { useCallback, useState } from "react";
import { createContext } from "react";
import { useEffect } from "react";
import axiosInstance from "./axiosinstance";
import Router from "next/router";
import { toast } from "react-toastify";
import { useContext } from "react";
import { translate } from "./i18n";
const AuthContext = createContext();

const decodeTokenExp = (token) => {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return decoded.exp ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
};
const WARN_BEFORE_MS = 10 * 60 * 1000;
// setTimeout overflows above ~24.8 days, so long-lived tokens are only checked on load.
const MAX_TIMER_MS = 2 ** 31 - 1;

const readStoredUser = () => {
  try {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setloading] = useState(false);
  const [error, seterror] = useState(null);

  const storeUser = useCallback((data, token) => {
    const stored = { ...data, token };
    localStorage.setItem("user", JSON.stringify(stored));
    setUser(stored);
  }, []);

  const refreshUser = useCallback(async () => {
    const stored = readStoredUser();
    if (!stored?.token) return null;
    try {
      const res = await axiosInstance.get("/user/me");
      const fresh = { ...res.data.data, token: stored.token };
      localStorage.setItem("user", JSON.stringify(fresh));
      setUser(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setUser(readStoredUser());
    setAuthReady(true);
    refreshUser();
    const onForcedLogout = () => setUser(null);
    window.addEventListener("auth:logout", onForcedLogout);
    return () => window.removeEventListener("auth:logout", onForcedLogout);
  }, [refreshUser]);

  useEffect(() => {
    let warnTimer;
    let expireTimer;
    const token = user?.token;
    const exp = token ? decodeTokenExp(token) : null;
    if (exp) {
      const msLeft = exp - Date.now();
      if (msLeft <= 0) {
        localStorage.removeItem("user");
        setUser(null);
      } else if (msLeft < MAX_TIMER_MS) {
        warnTimer = setTimeout(() => {
          toast.warn(translate("auth.sessionExpiringSoon"));
        }, Math.max(0, msLeft - WARN_BEFORE_MS));
        expireTimer = setTimeout(() => {
          localStorage.removeItem("user");
          setUser(null);
          toast.warn(translate("auth.sessionExpired"));
          if (window.location.pathname !== "/auth") {
            Router.push("/auth");
          }
        }, msLeft);
      }
    }
    return () => {
      clearTimeout(warnTimer);
      clearTimeout(expireTimer);
    };
  }, [user?.token]);

  const Signup = async ({ name, email, password, phone }) => {
    setloading(true);
    seterror(null);
    try {
      const res = await axiosInstance.post("/user/signup", {
        name,
        email,
        phone: phone || undefined,
        password,
      });
      const { data, token } = res.data;
      storeUser(data, token);
      toast.success(translate("auth.signupSuccess"));
      return data;
    } catch (error) {
      const msg = error.response?.data?.message || translate("auth.signupFailed");
      seterror(msg);
      toast.error(msg);
      throw error;
    } finally {
      setloading(false);
    }
  };

  // Resolves to { otpRequired, challengeId, destination } when the device must be verified, otherwise the user.
  const Login = async ({ email, password }) => {
    setloading(true);
    seterror(null);
    try {
      const res = await axiosInstance.post("/user/login", { email, password });
      if (res.data.otpRequired) {
        toast.info(translate("auth.otpSent", { destination: res.data.destination }));
        return res.data;
      }
      const { data, token } = res.data;
      storeUser(data, token);
      toast.success(translate("auth.loginSuccess"));
      return data;
    } catch (error) {
      const msg = error.response?.data?.message || translate("auth.loginFailed");
      seterror(msg);
      toast.error(msg);
      throw error;
    } finally {
      setloading(false);
    }
  };

  const verifyLoginOtp = async ({ challengeId, code, rememberDevice }) => {
    setloading(true);
    try {
      const res = await axiosInstance.post("/user/login/verify-otp", { challengeId, code, rememberDevice });
      const { data, token } = res.data;
      storeUser(data, token);
      toast.success(translate("auth.loginSuccess"));
      return data;
    } catch (error) {
      toast.error(error.response?.data?.message || translate("auth.otpInvalid"));
      throw error;
    } finally {
      setloading(false);
    }
  };

  const resendLoginOtp = async (challengeId) => {
    try {
      await axiosInstance.post("/user/login/resend-otp", { challengeId });
      toast.success(translate("auth.otpResent"));
    } catch (error) {
      toast.error(error.response?.data?.message || translate("common.error"));
    }
  };

  const Logout = async () => {
    try {
      if (readStoredUser()?.token) await axiosInstance.post("/user/logout");
    } catch {
      // The session may already be gone; clear local state regardless.
    }
    setUser(null);
    localStorage.removeItem("user");
    toast.info(translate("auth.loggedOut"));
  };

  const updateLocalUser = (updatedFields) => {
    setUser((prev) => {
      const newUser = { ...prev, ...updatedFields };
      localStorage.setItem("user", JSON.stringify(newUser));
      return newUser;
    });
  };

  const forgotPassword = async (identifier) => {
    setloading(true);
    seterror(null);
    try {
      const res = await axiosInstance.post("/user/forgot-password", { identifier });
      // A phone reset may first need an SMS code; the page shows that step itself.
      if (!res.data.otpRequired) toast.success(res.data.message || translate("forgot.success"));
      return res.data;
    } catch (error) {
      const msg =
        error.response?.data?.code === "SMS_FAILED"
          ? translate("language.smsFailed")
          : error.response?.data?.message || translate("forgot.failed");
      seterror(msg);
      if (error.response?.status === 429) toast.warn(msg);
      else toast.error(msg);
      throw error;
    } finally {
      setloading(false);
    }
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        Signup,
        Login,
        verifyLoginOtp,
        resendLoginOtp,
        Logout,
        updateLocalUser,
        refreshUser,
        forgotPassword,
        loading,
        error,
        authReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
export const useAuth = () => useContext(AuthContext);
