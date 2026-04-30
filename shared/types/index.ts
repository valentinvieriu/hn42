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

export interface HNUserProfile {
  username: string;
  created_at: string;
  karma: number;
  about: string | null;
}

export interface UserPost extends Story {
  created_at_i?: number;
  story_text?: string | null;
}

export interface UserComment {
  id: number;
  objectID: string;
  author: string;
  created_at: string;
  created_at_i?: number;
  text: string;
  story_id: string;
  story_title: string;
  story_url: string;
  parent_id: number | null;
  points: number;
}

export interface UserActivityPage<T> {
  items: T[];
  page: number;
  hitsPerPage: number;
  nbHits: number;
  nbPages: number;
  nextPage: number | null;
  nextCursor: number | null;
  hasMore: boolean;
  exhaustiveNbHits?: boolean;
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
