import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LessonRunLocally } from '../../content/content.models';
import { ReferenceLanguageService } from '../reference-language';
import { LessonStart } from './lesson-start';

const twoLanguages: LessonRunLocally = {
  requirements: [],
  steps: [],
  downloads: [
    {
      language: 'java',
      href: '/content/blaze/ai-systems-architecture/downloads/on-call-java-project.json',
      label: 'Download the Java project (.zip)',
      requirements: ['JDK 21 or newer'],
      steps: ['Run <code>./mvnw test</code>.'],
    },
    {
      language: 'python',
      href: '/content/blaze/ai-systems-architecture/downloads/on-call-python-project.json',
      label: 'Download the Python project (.zip)',
      requirements: ['Python 3.12 or newer'],
      steps: ['Run <code>python -m pytest</code>.'],
    },
  ],
};

function render(runLocally: LessonRunLocally) {
  TestBed.configureTestingModule({ imports: [LessonStart], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(LessonStart);
  fixture.componentRef.setInput('runLocally', runLocally);
  fixture.detectChanges();
  return fixture;
}

const text = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll(selector)].map((element) => element.textContent?.replace(/\s+/g, ' ').trim());

describe('LessonStart', () => {
  it('shows the project for the page-wide reference language and switches with it', () => {
    const fixture = render(twoLanguages);
    const root = fixture.nativeElement as HTMLElement;
    expect(text(root, '.project-languages button')).toEqual(['Java', 'Python']);
    expect(root.querySelector('.project-languages [aria-pressed="true"]')?.textContent?.trim()).toBe('Java');
    expect(text(root, '.run-locally-body ul li')).toEqual(['JDK 21 or newer']);
    expect(root.querySelector('.project-download')?.textContent).toContain('Download the Java project (.zip)');

    (root.querySelectorAll<HTMLButtonElement>('.project-languages button')[1]).click();
    fixture.detectChanges();
    expect(TestBed.inject(ReferenceLanguageService).selected()).toBe('python');
    expect(text(root, '.run-locally-body ul li')).toEqual(['Python 3.12 or newer']);
    expect(text(root, '.run-locally-body ol li')).toEqual(['Run python -m pytest.']);
    expect(root.querySelector('.project-download')?.textContent).toContain('Download the Python project (.zip)');
  });

  it('falls back to the first project when the reference language has none', () => {
    const fixture = render(twoLanguages);
    TestBed.inject(ReferenceLanguageService).select('go');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.project-languages [aria-pressed="true"]')?.textContent?.trim()).toBe('Java');
    expect(root.querySelector('.project-download')?.textContent).toContain('Java');
  });

  it('keeps the single-project layout for lessons with one download', () => {
    const fixture = render({
      requirements: ['JDK 21'],
      steps: ['Open the folder.'],
      download: { href: '/content/learn/java/downloads/x-project.json' },
    });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.project-languages')).toBeNull();
    expect(root.querySelector('.project-download')?.textContent).toContain('Download the project (.zip)');
    expect(text(root, '.run-locally-body ol li')).toEqual(['Open the folder.']);
  });
});
