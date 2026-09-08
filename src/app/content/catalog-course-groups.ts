export interface CatalogCourseGroup {
  id: string;
  title: string;
  description: string;
  courseIds: string[];
  featuredCourseId?: string;
  featuredLabel?: string;
}
