import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const requireCloudinaryConfig = () => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
  }
};

export const uploadCommunityImage = async (dataUrl) => {
  requireCloudinaryConfig();
  const uploaded = await cloudinary.uploader.upload(dataUrl, {
    folder: "stackoverflow-clone/community-posts",
    resource_type: "image",
    transformation: [{ width: 1200, crop: "limit", quality: "auto", fetch_format: "auto" }],
  });

  return { publicId: uploaded.public_id, url: uploaded.secure_url };
};

export const destroyCommunityImage = async (publicId) => {
  if (!publicId) return;
  requireCloudinaryConfig();
  await cloudinary.uploader.destroy(publicId);
};
