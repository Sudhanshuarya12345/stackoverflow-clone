import axios from "axios";
import Router from "next/router";
import { toast } from "react-toastify";

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
      const token = JSON.parse(user).token;
      if (token) {
        req.headers.Authorization = `Bearer ${token}`;
      }
    }
  }
  return req;
});
axiosInstance.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("user");
      if (window.location.pathname !== "/auth") {
        toast.error("Session expired — please log in again.");
        Router.push("/auth");
      }
    }
    return Promise.reject(error);
  }
);
export default axiosInstance;