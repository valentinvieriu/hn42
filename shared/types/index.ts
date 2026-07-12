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
}

export interface HNUserProfile {
  username: string;
  created_at: string;
  karma: number;
  about: string | null;
}

export type UserPost = Story;

export interface UserComment {
  objectID: string;
  created_at: string;
  text: string;
  story_id: string;
  story_title: string;
  story_url: string;
  points: number;
}

export interface UserActivityPage<T> {
  items: T[];
  nbHits: number;
  nextPage: number | null;
  nextCursor: number | null;
  hasMore: boolean;
}

export interface Comment {
  id: number;
  created_at: string;
  author: string;
  text: string;
  parent_id: number | null;
  children: Comment[];
}

export interface StoryDetail {
  created_at: string;
  author: string;
  title: string;
  url: string;
  text: string | null;
  points: number;
  children: Comment[];
}

export interface RelatedStory {
  title: string;
  objectID: string;
  points: number;
  num_comments: number;
  author: string;
}
