/** DLV-941 test data: a course locator that also carries protected-looking fields. */
export const protectedBodyFixture = 'PROTECTED-BODY-7f3a';

/** The document title plus every tag in <head>, for leak checks. */
export function head(document: Document): string {
  return `${document.title}\n${document.head.innerHTML}`;
}

/** Removes meta and canonical tags left by an earlier test. */
export function clearHead(document: Document): void {
  document.head
    .querySelectorAll('meta[name], meta[property], link[rel="canonical"]')
    .forEach((node) => node.remove());
}

export function locatorFixture(): Record<string, unknown> {
  return {
    schemaVersion: 'course-content-locator/v1',
    course: {
      id: 'core-java',
      path: 'learn',
      title: 'Java Foundations',
      description: 'LEARN Java from your <strong>first</strong> program.',
      body: protectedBodyFixture,
      modules: [
        {
          id: 'java-platform',
          order: 1,
          title: 'Java Platform Fundamentals',
          description: 'Write and run your first Java program.',
          interviewAnswer: protectedBodyFixture,
        },
        { id: 'generics', order: 2, title: 'Generics', description: '' },
      ],
      sections: [
        { id: 'practice', title: 'Practice set', description: 'Practice the basics.', moduleIds: [] },
      ],
      learningUnits: [
        {
          id: 'java-platform',
          title: 'Java Platform',
          description: 'How a Java file becomes a running program.',
          theoryModuleId: 'java-platform',
          card: { scene: '/assets/scenes/units/learn/core-java/java-platform.svg', summary: protectedBodyFixture },
        },
        {
          id: 'generics',
          title: 'Generics',
          description: 'Typed collections without casts.',
          theoryModuleId: 'generics',
          card: { scene: '/content/learn/core-java/visuals/cards/generics.svg' },
          subUnits: [{ id: 'planned-unit', title: 'Later', description: '', planned: true }],
        },
      ],
    },
    modules: [
      { moduleId: 'java-platform', href: '/content/learn/core-java/modules/java-platform.json', version: 'v1' },
    ],
    items: [
      {
        id: 'java-platform-execution-model',
        moduleId: 'java-platform',
        order: 1,
        title: 'How Java runs your code',
        contentType: 'theory',
        detailRef: {
          kind: 'content-item',
          href: '/content/learn/core-java/modules/java-platform.json',
          version: 'v1',
        },
        // A locator must never carry these; if one ever did, they still stay out of meta tags.
        interviewAnswer: protectedBodyFixture,
        summary: `<p>${protectedBodyFixture}</p>`,
        explanation: [protectedBodyFixture],
        code: `System.out.println("${protectedBodyFixture}");`,
        solutions: [{ language: 'java', code: protectedBodyFixture }],
      },
      {
        id: 'compiled-or-interpreted',
        moduleId: 'generics',
        order: 1,
        title: 'Is Java compiled or interpreted?',
        contentType: 'q-and-a',
        detailRef: { kind: 'content-item', href: '/content/learn/core-java/modules/generics.json', version: 'v1' },
      },
    ],
  };
}
