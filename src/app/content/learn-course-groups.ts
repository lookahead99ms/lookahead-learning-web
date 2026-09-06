export interface LearnCourseGroup {
  id: string;
  title: string;
  description: string;
  courseIds: string[];
}

export const LEARN_COURSE_GROUPS: LearnCourseGroup[] = [
  {
    id: 'language-foundations',
    title: 'Programming Language Foundations',
    description:
      'Start with the language you need, then compare Java, Python, and Go without treating one language as a prerequisite for another.',
    courseIds: [
      'core-java',
      'python-fundamentals',
      'go-fundamentals',
      'language-comparative-analysis',
    ],
  },
  {
    id: 'java-platform',
    title: 'Java Platform and Runtime',
    description:
      'Build on Java foundations with collections, modern language features, JVM memory, garbage collection, diagnostics, and concurrency.',
    courseIds: ['java-data-structures', 'modern-java', 'garbage-collection'],
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
    id: 'object-design-lld',
    title: 'Object Design & Low-Level Design',
    description:
      'Model valid state, apply SOLID and design patterns, reason about concurrency, and practise frequently asked LLD interviews.',
    courseIds: ['oop', 'solid-design-patterns'],
  },
  {
    id: 'engineering-tools',
    title: 'Engineering Tools',
    description:
      'Build a reliable workflow for debugging, source control, operating systems, data, containers, and continuous feedback.',
    courseIds: ['developer-workflow', 'git', 'linux', 'sql', 'docker'],
  },
];
