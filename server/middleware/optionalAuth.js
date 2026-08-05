import jwt from "jsonwebtoken";

const optionalAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const token = header.split(" ")[1];
      const decodedata = jwt.verify(token, process.env.JWT_SECRET);
      req.userid = decodedata?.id;
    }
  } catch (error) {
    req.userid = null;
  }
  next();
};

export default optionalAuth;
