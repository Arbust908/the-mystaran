// server/utils/types.ts
export type UUID = string;

export interface Category {
  id: UUID;
  name: string;
  description: string;
}

export interface Tag {
  id: UUID;
  name: string;
  description: string;
}

export interface Article {
  id: UUID;
  old_id: number;
  title: string;
  link: string;
  images: string[];
  created_at: string;
  content: string;
  categories: Category['id'][];
  tags: Tag['id'][];
  comment_ids: number[];
  related_ids: number[];
}

export interface Comment {
  id: UUID;
  old_id: number;
  author: string;
  content: string[];
  created_at: string;
  article_id: UUID;
}
