import { useState } from "react";
import { createContext } from "react";
import { useEffect } from "react";
import axiosInstance from "./axiosinstance";
import Router from "next/router";
import { toast } from "react-toastify";
import { useContext } from "react";
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

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setloading] = useState(false);
  const [error, seterror] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) setUser(JSON.parse(stored));
    } catch {
      setUser(null);
    }
    setAuthReady(true);
  }, []);

  useEffect(() => {
    let warnTimer;
    let expireTimer;
    const stored = localStorage.getItem("user");
    if (stored) {
      const token = JSON.parse(stored).token;
      const exp = token ? decodeTokenExp(token) : null;
      if (exp) {
        const msLeft = exp - Date.now();
        if (msLeft <= 0) {
          localStorage.removeItem("user");
          setUser(null);
        } else {
          warnTimer = setTimeout(() => {
            toast.warn("Your session expires soon — please log in again to continue.");
          }, Math.max(0, msLeft - WARN_BEFORE_MS));
          expireTimer = setTimeout(() => {
            localStorage.removeItem("user");
            setUser(null);
            toast.warn("Session expired — you have been logged out.");
            if (window.location.pathname !== "/auth") {
              Router.push("/auth");
            }
          }, msLeft);
        }
      }
    }
    return () => {
      clearTimeout(warnTimer);
      clearTimeout(expireTimer);
    };
  }, [user]);

  const Signup = async ({ name, email, password }) => {
    setloading(true);
    seterror(null);
    try {
      const res = await axiosInstance.post("/user/signup", {
        name,
        email,
        password,
      });
      const { data, token } = res.data;
      localStorage.setItem("user", JSON.stringify({...data,token}));
      setUser(data);
      toast.success("Signup Successful");
      return data;
    } catch (error) {
      const msg = error.response?.data.message || "Signup failed";
      seterror(msg);
      toast.error(msg);
      throw error;
    } finally {
      setloading(false);
    }
  };
  const Login = async ({ email, password }) => {
    setloading(true);
    seterror(null);
    try {
      const res = await axiosInstance.post("/user/login", {
        email,
        password,
      });
      const { data, token } = res.data;
      localStorage.setItem("user", JSON.stringify({...data,token}));
      setUser(data);
      toast.success("Login Successful");
      return data;
    } catch (error) {
      const msg = error.response?.data.message || "Login failed";
      seterror(msg);
      toast.error(msg);
      throw error;
    } finally {
      setloading(false);
    }
  };
  const Logout = () => {
    setUser(null);
    localStorage.removeItem("user");
    toast.info("Logged out");
  };
  const updateLocalUser = (updatedFields) => {
    setUser(prev => {
      const newUser = { ...prev, ...updatedFields };
      localStorage.setItem("user", JSON.stringify(newUser));
      return newUser;
    });
  };
  return (
    <AuthContext.Provider
      value={{ user, Signup, Login, Logout, updateLocalUser, loading, error, authReady }}
    >
      {children}
    </AuthContext.Provider>
  );
};
export const useAuth = () => useContext(AuthContext);
