// ─── Nest Type Definitions ───

export interface Course {
  id: string;
  name: string;
  subtitle: string;
  localPath: string;
  icon: string;
  createdAt: string;
}

export type FileType = 'video' | 'text' | 'code' | 'document' | 'link' | 'image' | 'other';

export interface FileItem {
  name: string;
  type: FileType | 'folder';
  path: string;
  size?: number;
  children?: FileItem[];
  totalVideos?: number;
}

export interface DirectoryScanResult {
  items: FileItem[];
  totalVideos: number;
}

export interface CourseWithVideos extends Course {
  totalVideos: number;
}

export interface CourseProgress {
  [courseId: string]: {
    [filePath: string]: boolean;
  };
}
