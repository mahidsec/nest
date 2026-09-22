// ─── Shared frontend types (mirror src/types.ts) ───
export type FileType = "video" | "text" | "code" | "document" | "link" | "image" | "other";

export interface FileItem {
  name: string;
  type: FileType | "folder";
  path: string;
  size?: number;
  children?: FileItem[];
  totalVideos?: number;
}

export interface CourseWithVideos {
  id: string;
  name: string;
  subtitle: string;
  localPath: string;
  icon: string;
  createdAt: string;
  totalVideos: number;
}
