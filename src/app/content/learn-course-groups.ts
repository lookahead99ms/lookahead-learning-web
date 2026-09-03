export interface LearnCourseGroup {
  id: string;
  title: string;
  description: string;
  courseIds: string[];
}

export const LEARN_COURSE_GROUPS: LearnCourseGroup[] = [
  {
    id: 'java-foundations',
    title: 'Java Foundations',
    description:
      'Build Java fluency from language mechanics and collections through runtime behavior.',
    courseIds: ['core-java', 'java-data-structures', 'modern-java', 'garbage-collection'],
  },
  {
    id: 'programming-basics-java',
    title: 'Programming Basics in Java',
    description: 'Model behavior clearly and design reliable, composable software.',
    courseIds: ['oop', 'solid-design-patterns'],
  },
  {
    id: 'python-go',
    title: 'Python & Go',
    description: 'Build fluency in Python and Go, then compare their trade-offs with Java.',
    courseIds: ['python-fundamentals', 'go-fundamentals', 'language-comparative-analysis'],
  },
  {
    id: 'data-structures-algorithms',
    title: 'Data Structures and Algorithms',
    description: 'Choose representations, reason about cost, and apply repeatable algorithms.',
    courseIds: [
      'big-o-analysis',
      'core-data-structures',
      'sorting-searching',
      'algorithmic-patterns',
      'hands-on-dsa',
    ],
  },
  {
    id: 'engineering-tools',
    title: 'Engineering Tools',
    description:
      'Build a reliable workflow for debugging, source control, operating systems, data, containers, and continuous feedback.',
    courseIds: ['developer-workflow', 'git', 'linux', 'sql', 'docker'],
  },
];
