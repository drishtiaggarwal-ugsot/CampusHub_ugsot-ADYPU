/**
 * Application data types and fallbacks.
 * CampusHub runs purely on real data from Cloud Firestore.
 */
import type { CampusEvent, Highlight, Post, Student } from './types';

export const CURRENT_USER_ID = 'student-dev';

export const events: CampusEvent[] = [];

export const students: Student[] = [];

export const highlights: Highlight[] = [];

export const posts: Post[] = [];

export const getStudent = (id: string): Student | undefined =>
  students.find((s) => s.id === id);

export const getEvent = (id: string): CampusEvent | undefined =>
  events.find((e) => e.id === id);

export const studentIndex = (id: string): number => {
  if (!id) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};
