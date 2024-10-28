export interface BaseStory {
  objectID: string;
  title: string;
  author: string;
  created_at: string;
  points: number;
  url: string;
}

export interface Story extends BaseStory {
  num_comments: number;
  text?: string | null;
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
