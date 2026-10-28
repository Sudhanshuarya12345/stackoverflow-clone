import axios from "axios";
import Router from "next/router";
import { toast } from "react-toastify";
import { getDeviceId } from "./deviceId";
import { dictionaries } from "@/locales";

const axiosInstance = axios.create({
  baseURL: process.env.BACKEND_URL,
  headers: {
    "Content-Type": "application/json",
  },
});
axiosInstance.interceptors.request.use((req) => {
  if (typeof window !== "undefined") {
    const user = localStorage.getItem("user");
    if (user) {
      const { token, language } = JSON.parse(user);
      if (token) {
        req.headers.Authorization = `Bearer ${token}`;
      }
      // The server translates its response messages into the language the site is shown in.
      if (language) req.headers["X-Language"] = language;
    }
    const deviceId = getDeviceId();
    if (deviceId) req.headers["X-Device-Id"] = deviceId;
  }
  return req;
});
axiosInstance.interceptors.response.use(
  (res) => res,
  (error) => {
    const hadToken = Boolean(error.config?.headers?.Authorization);
    if (error.response?.status === 401 && hadToken && typeof window !== "undefined") {
      const language = error.config?.headers?.["X-Language"];
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("auth:logout"));
      if (window.location.pathname !== "/auth") {
        toast.error(error.response?.data?.message || (dictionaries[language] || dictionaries.en)["auth.sessionExpired"]);
        Router.push("/auth");
      }
    }
    return Promise.reject(error);
  }
);
export default axiosInstance;
