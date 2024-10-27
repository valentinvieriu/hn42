export interface Story {
  id?: number;
  objectID: string;
  title: string;
  author: string;
  created_at: string;
  points: number;
  num_comments: number;
  url: string;
  text?: string | null;
  parent_id?: number | null;
  children?: Comment[];
  screenshotUrl: string;
}

export interface Comment {
  id: number;
  created_at: string;
  author: string;
  text: string;
  points: number;
  parent_id: number | null;
  children: Comment[];
}

export interface HNResponse {
  id: number;
  created_at: string;
  author: string;
  title: string;
  url: string;
  text: string | null;
  points: number;
  parent_id: number | null;
  children: Comment[];
}

export interface HNHit {
  objectID: string;
  title: string;
  author: string;
  created_at: string;
  points: number;
  num_comments: number;
  url: string;
}
