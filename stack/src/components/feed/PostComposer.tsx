import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import axiosInstance from "@/lib/axiosinstance";
import { Code2, ImagePlus, Send, X } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function PostComposer({ onCreated }: { onCreated: (post: any) => void }) {
  const [content, setContent] = useState("");
  const [type, setType] = useState("update");
  const [images, setImages] = useState<string[]>([]);
  const [code, setCode] = useState({ language: "javascript", code: "" });
  const [showCode, setShowCode] = useState(false);
  const [posting, setPosting] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).slice(0, 4 - images.length);
    const oversized = selected.find((file) => file.size > 4 * 1024 * 1024);
    if (oversized) {
      toast.error("Each image must be 4MB or smaller before Cloudinary upload.");
      return;
    }
    const dataUrls = await Promise.all(selected.map(readFileAsDataUrl));
    setImages((prev) => [...prev, ...dataUrls].slice(0, 4));
  };

  const submitPost = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setPosting(true);
      const res = await axiosInstance.post("/api/community/posts", {
        content,
        type,
        images,
        code: showCode ? code : undefined,
      });
      onCreated(res.data.data);
      setContent("");
      setImages([]);
      setCode({ language: "javascript", code: "" });
      setShowCode(false);
      toast.success("Posted to the community feed");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not create post");
    } finally {
      setPosting(false);
    }
  };

  return (
    <form onSubmit={submitPost} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["update", "Update"],
            ["showcase", "Showcase"],
            ["project", "Project"],
            ["achievement", "Achievement"],
            ["snippet", "Snippet"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${type === value ? "bg-orange-600 text-white" : "bg-orange-50 text-orange-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share a technical update, #learning milestone, @teammate mention, or project note..."
          className="min-h-28 border-orange-100 focus-visible:ring-orange-300"
        />
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {images.map((image, index) => (
              <div key={image.slice(0, 30)} className="relative overflow-hidden rounded-xl border">
                <img src={image} alt={`Upload preview ${index + 1}`} className="h-28 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== index))}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {showCode && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Label htmlFor="code-language">Language</Label>
            <Input
              id="code-language"
              value={code.language}
              onChange={(e) => setCode((prev) => ({ ...prev, language: e.target.value }))}
              className="mb-2 mt-1 bg-white"
            />
            <Textarea
              value={code.code}
              onChange={(e) => setCode((prev) => ({ ...prev, code: e.target.value }))}
              placeholder="Paste a focused snippet"
              className="min-h-32 font-mono text-sm"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-orange-200 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50">
              <ImagePlus className="h-4 w-4" /> Images
              <input type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
            </label>
            <Button type="button" variant="outline" onClick={() => setShowCode((prev) => !prev)}>
              <Code2 className="mr-2 h-4 w-4" /> Code
            </Button>
          </div>
          <Button type="submit" disabled={posting} variant="outline" className="border-orange-300 bg-white text-orange-700 hover:bg-orange-50">
            <Send className="mr-2 h-4 w-4" /> {posting ? "Posting..." : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
}
