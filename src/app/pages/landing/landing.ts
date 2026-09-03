import { Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { LandingSearch } from '../../core/landing-search/landing-search';

type StageId = 'learn' | 'grow' | 'look-ahead';

type RoadmapStage = {
  id: StageId;
  title: string;
  step: string;
  category: string;
  subtitle: string;
  topics: { id: string; title: string; learnGroupId?: string; growGroupId?: string }[];
};

@Component({
  selector: 'app-landing',
  imports: [PlatformHeader, LandingSearch, RouterLink],
  templateUrl: './landing.html',
  styles: [
    `
      .landing-page {
        min-height: 100vh;
        padding-bottom: 80px;
        background: var(--surface-page);
        color: var(--text-strong);
      }
      .landing-page .content-header {
        position: sticky;
        top: 0;
        z-index: 100;
      }
      .landing-page .roadmap-stage-btn.grow {
        --stage-color: var(--grow-accent);
      }
      .landing-page .roadmap-stage-btn.look-ahead {
        --stage-color: var(--text-body);
      }
      .landing-page .hero-tagline-btn.grow {
        background: #fff7ed;
      }
      .landing-page .hero-tagline-btn.look-ahead {
        background: var(--surface-muted);
      }
      .landing-page .hero-tagline-btn.grow:hover,
      .landing-page .hero-tagline-btn.grow:focus-visible {
        background: linear-gradient(135deg, var(--grow-accent), #d18a43);
      }
      .landing-page .hero-tagline-btn.look-ahead:hover,
      .landing-page .hero-tagline-btn.look-ahead:focus-visible {
        background: linear-gradient(135deg, var(--text-body), #475569);
      }
      .landing-page .tab-btn.grow {
        background: linear-gradient(90deg, #fff7ed, #fffaf6);
      }
      .landing-page .tab-btn.look-ahead {
        background: linear-gradient(90deg, var(--surface-muted), var(--surface));
      }
      .landing-page .tab-btn.active.grow,
      .landing-page .tab-btn.grow:hover {
        color: var(--grow-accent);
      }
      .landing-page .tab-btn.active.look-ahead,
      .landing-page .tab-btn.look-ahead:hover {
        color: var(--text-body);
      }
      .landing-page .tab-btn.active.grow::after {
        background: var(--grow-accent);
      }
      .landing-page .tab-btn.active.look-ahead::after {
        background: var(--text-body);
      }
      .landing-page .stage-grow {
        --stage-color: var(--grow-accent);
      }
      .landing-page .stage-look-ahead {
        --stage-color: var(--text-body);
      }
      .roadmap-container {
        scroll-margin-top: 92px;
      }
      .roadmap-actions {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 10px;
      }
      .roadmap-stage-btn {
        padding: 10px 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--text-body);
        background: var(--surface);
        cursor: pointer;
        font: inherit;
        font-weight: 750;
        transition:
          border-color 160ms ease,
          color 160ms ease,
          background 160ms ease,
          transform 160ms ease;
      }
      .roadmap-stage-btn:hover,
      .roadmap-stage-btn:focus-visible {
        border-color: var(--stage-color);
        color: var(--stage-color);
        outline: none;
        transform: translateY(-1px);
      }
      .roadmap-stage-btn.learn {
        --stage-color: var(--cyan);
      }
      .roadmap-stage-btn.grow {
        --stage-color: var(--orange);
      }
      .roadmap-stage-btn.look-ahead {
        --stage-color: #a4771b;
      }
      .landing-hero {
        padding: 40px 7vw 22px;
        text-align: center;
        background:
          radial-gradient(circle at 8% 18%, rgba(56, 122, 204, 0.27), transparent 30%),
          radial-gradient(circle at 92% 12%, rgba(210, 157, 38, 0.22), transparent 28%),
          radial-gradient(circle at 58% 100%, rgba(224, 91, 20, 0.14), transparent 34%),
          linear-gradient(135deg, #eef5ff 0%, var(--surface-subtle) 48%, #fff6e8 100%);
      }
      .landing-hero h1 {
        max-width: 980px;
        margin: 0 auto 16px;
        color: var(--text-strong);
        font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
        font-size: clamp(2.1rem, 4.2vw, 4.2rem);
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.045em;
        text-wrap: balance;
      }
      .hero-eyebrow {
        margin: 0 0 12px;
        color: var(--text-subtle);
        font-size: 0.82rem;
        font-weight: 850;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      .hero-support {
        max-width: 720px;
        margin: 0 auto 18px;
        color: #475569;
        font-size: 1.08rem;
        line-height: 1.65;
      }
      .hero-question-library-link {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin-top: 12px;
        color: #315f9d;
        font-size: 0.88rem;
        font-weight: 750;
        text-decoration-thickness: 1px;
        text-underline-offset: 4px;
      }
      .hero-question-library-link:hover,
      .hero-question-library-link:focus-visible {
        color: #173f75;
        outline: none;
      }
      .hero-tagline-actions {
        max-width: 950px;
        margin: 18px auto 0;
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 4px 18px;
      }
      .hero-tagline-btn {
        padding: 10px 14px;
        border: 0;
        color: var(--text-subtle);
        background: transparent;
        cursor: pointer;
        font: inherit;
        font-size: 1.05rem;
        font-weight: 500;
        line-height: 1.8;
        letter-spacing: -0.1px;
        white-space: nowrap;
      }
      .hero-tagline-btn {
        border: 1px solid transparent;
        border-radius: 4px;
        color: var(--text-strong);
        background: var(--surface-muted);
        font-weight: 650;
      }
      .hero-tagline-btn.learn {
        background: #dbeafe;
      }
      .hero-tagline-btn.grow {
        background: #ffedd5;
      }
      .hero-tagline-btn.look-ahead {
        background: #fef3c7;
      }
      .hero-tagline-btn:hover,
      .hero-tagline-btn:focus-visible {
        color: var(--surface);
        outline: none;
        transform: translateY(-1px);
        text-decoration: underline;
        text-underline-offset: 4px;
      }
      .hero-tagline-btn.learn:hover,
      .hero-tagline-btn.learn:focus-visible {
        background: linear-gradient(135deg, var(--cyan), #4bafbf);
      }
      .hero-tagline-btn.grow:hover,
      .hero-tagline-btn.grow:focus-visible {
        background: linear-gradient(135deg, #e65c00, #ff985c);
      }
      .hero-tagline-btn.look-ahead:hover,
      .hero-tagline-btn.look-ahead:focus-visible {
        background: linear-gradient(135deg, #b88715, #e3bd55);
      }
      .bridge-subtext .line-one,
      .bridge-subtext .line-two {
        display: block;
      }
      .bridge-subtext .line-one {
        margin-bottom: 6px;
        font-weight: 400;
      }
      .bridge-subtext .line-two {
        color: var(--text-subtle);
      }
      .tab-btn {
        position: relative;
        border-bottom: 0;
      }
      .tab-btn.active::after {
        height: 4px;
        border-radius: 4px 4px 0 0;
        content: '';
        position: absolute;
        right: auto;
        bottom: 0;
        left: 18px;
        transform: none;
      }
      .tab-btn.active.learn::after {
        width: 64px;
        background: var(--cyan);
      }
      .tab-btn.active.grow::after {
        width: 64px;
        background: var(--orange);
      }
      .tab-btn.active.look-ahead::after {
        width: 64px;
        background: var(--text-body);
      }
      .roadmap-cta {
        display: inline-flex;
        padding: 13px 20px;
        border-radius: 10px;
        color: var(--surface);
        background: linear-gradient(135deg, var(--orange), #e5484d);
        font-weight: 800;
        text-decoration: none;
        box-shadow: 0 10px 26px rgba(229, 72, 77, 0.2);
      }
      .roadmap-container {
        width: min(1100px, 88vw);
        margin: 24px auto;
        overflow: hidden;
        border: 1px solid rgba(23, 32, 51, 0.08);
        border-radius: 16px;
        background: var(--surface);
        box-shadow: 0 10px 30px rgba(23, 32, 51, 0.06);
      }
      .bridge-container {
        padding: 18px 40px 14px;
        text-align: center;
      }
      .bridge-title {
        margin: 0 0 8px;
        font-size: clamp(1.5rem, 3vw, 2.25rem);
        letter-spacing: -0.04em;
      }
      .bridge-subtext {
        max-width: 760px;
        margin: 6px auto 4px;
        color: #475569;
        font-size: 1.05rem;
        line-height: 1.6;
        text-align: center;
      }
      .tab-navigation {
        display: flex;
        gap: 0;
        margin-top: 8px;
        background: #fafbfc;
      }
      .tab-btn {
        flex: 1;
        min-height: 64px;
        padding: 10px 18px;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        border: 0;
        color: var(--text-subtle);
        background: var(--surface-subtle);
        cursor: pointer;
        font: inherit;
        text-align: left;
        position: relative;
        outline: none;
        transition:
          background 160ms ease,
          color 160ms ease,
          transform 160ms ease;
      }
      .tab-btn:hover,
      .tab-btn:focus-visible {
        outline: none;
        transform: translateY(-1px);
      }
      .tab-btn.learn {
        background: linear-gradient(90deg, #e5f5fa, #f8fcfd);
      }
      .tab-btn.grow {
        background: linear-gradient(90deg, #fff1e6, #fffaf6);
      }
      .tab-btn.look-ahead {
        background: linear-gradient(90deg, #fff9df, #fffdf8);
      }
      .tab-btn.learn:hover,
      .tab-btn.active.learn {
        color: var(--cyan);
      }
      .tab-btn.grow:hover,
      .tab-btn.active.grow {
        color: var(--orange);
      }
      .tab-btn.look-ahead:hover,
      .tab-btn.active.look-ahead {
        color: #a4771b;
      }
      .tab-btn.active {
        box-shadow: none;
      }
      .tab-step {
        font-size: 0.78rem;
        font-variant-numeric: tabular-nums;
        opacity: 0.7;
      }
      .tab-label {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .tab-label strong {
        font-size: 0.95rem;
        letter-spacing: 0.06em;
      }
      .tab-label small {
        color: inherit;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: normal;
        text-transform: none;
        opacity: 0.78;
      }
      .tab-content-panel {
        padding: 24px 40px 40px;
      }
      .stage-kicker {
        margin: 0 0 12px;
        color: var(--stage-color);
        font-size: 0.76rem;
        font-weight: 850;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .stage-subtitle {
        max-width: 700px;
        margin: 0 0 16px;
        color: var(--text-body);
        font-size: 1.1rem;
        font-weight: 500;
        line-height: 1.6;
      }
      .stage-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
      }
      .stage-summary .stage-subtitle {
        margin-bottom: 0;
      }
      .stage-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        color: var(--stage-color);
        font-size: 0.9rem;
        font-weight: 800;
        text-decoration: none;
        border-bottom: 1px solid transparent;
        padding-bottom: 3px;
      }
      .stage-link:hover,
      .stage-link:focus-visible {
        color: var(--text);
        border-bottom-color: currentColor;
        outline: none;
      }
      .skills-pill-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        margin-top: 16px;
      }
      .skill-pill {
        padding: 10px 18px;
        border: 1px solid color-mix(in srgb, var(--stage-color) 28%, var(--line));
        border-radius: 8px;
        color: var(--stage-color);
        background: color-mix(in srgb, var(--stage-color) 6%, var(--surface));
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        font-family:
          Inter,
          ui-sans-serif,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
        font-size: 0.8rem;
        font-weight: 700;
        text-decoration: none;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        white-space: nowrap;
      }
      .skill-pill:hover,
      .skill-pill:focus-visible {
        border-color: var(--line);
        background: var(--surface);
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
        outline: none;
        transform: translateY(-1px);
      }
      .stage-learn {
        --stage-color: var(--cyan);
      }
      .stage-grow {
        --stage-color: var(--orange);
      }
      .stage-look-ahead {
        --stage-color: #e8b841;
      }
      .landing-faq {
        width: min(1100px, 88vw);
        margin: 40px auto 0;
      }
      .faq-bar > details {
        padding: 0 20px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .faq-bar > details > summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 0;
        color: var(--text-strong);
        cursor: pointer;
        font-weight: 750;
      }
      .faq-bar > details > summary small {
        color: var(--text-subtle);
        font-size: 0.8rem;
        font-weight: 600;
      }
      .faq-bar-content {
        padding-bottom: 10px;
        border-top: 1px solid var(--surface-muted);
      }
      .faq-bar-content details {
        padding: 0;
        border: 0;
        border-bottom: 1px solid var(--surface-muted);
        border-radius: 0;
        background: transparent;
      }
      .faq-bar-content details:last-child {
        border-bottom: 0;
      }
      .faq-bar-content summary {
        padding: 15px 0;
        color: var(--text-body);
        cursor: pointer;
        font-weight: 700;
      }
      .faq-bar-content p {
        margin: 0 0 16px;
        color: var(--text-subtle);
        line-height: 1.6;
      }
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
      }
      @media (max-width: 768px) {
        .landing-hero {
          padding: 34px 5vw 24px;
        }
        .hero-tagline-actions {
          flex-direction: column;
          align-items: center;
          gap: 0;
        }
        .hero-tagline-btn {
          white-space: normal;
        }
        .stage-summary {
          align-items: flex-start;
          flex-direction: column;
          gap: 12px;
        }
        .roadmap-container {
          width: 90vw;
        }
        .bridge-container,
        .tab-content-panel {
          padding-inline: 24px;
        }
        .tab-navigation {
          flex-direction: column;
        }
        .tab-btn {
          border-bottom: 0;
          border-left: 4px solid transparent;
          text-align: left;
        }
        .tab-btn.active::after {
          width: 4px;
          height: 60%;
          top: 20%;
          right: auto;
          bottom: auto;
          left: 0;
          border-radius: 0 3px 3px 0;
          transform: none;
        }
        .tab-btn.active.learn::after {
          width: 4px;
          background: var(--cyan);
        }
        .tab-btn.active.grow::after {
          width: 4px;
          background: var(--orange);
        }
        .tab-btn.active.look-ahead::after {
          width: 4px;
          background: var(--text-body);
        }
        .skills-pill-grid {
          gap: 9px;
        }
        .skill-pill {
          font-size: 0.88rem;
          padding: 8px 12px;
        }
      }
    `,
  ],
})
export class Landing {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  protected readonly selectedStage = signal<StageId>('learn');

  protected readonly stages: RoadmapStage[] = [
    {
      id: 'learn',
      title: 'Learn',
      step: '01',
      category: 'Core Competencies',
      subtitle:
        'Build the Language, Data, Algorithm, and Tooling Foundation that Confident Engineering and Top-Tier Interview Performance depend on.',
      topics: [
        { id: 'java-foundations', title: 'Java Foundations', learnGroupId: 'java-foundations' },
        {
          id: 'programming-basics-java',
          title: 'Programming Basics in Java',
          learnGroupId: 'programming-basics-java',
        },
        { id: 'python-go', title: 'Python & Go', learnGroupId: 'python-go' },
        {
          id: 'data-structures-algorithms',
          title: 'Data Structures and Algorithms',
          learnGroupId: 'data-structures-algorithms',
        },
        { id: 'engineering-tools', title: 'Engineering Tools', learnGroupId: 'engineering-tools' },
      ],
    },
    {
      id: 'grow',
      title: 'Grow',
      step: '02',
      category: 'Applied Capabilities',
      subtitle: 'Turn Foundational Knowledge into Secure, Tested, Production-Ready Applications.',
      topics: [
        {
          id: 'backend-engineering',
          title: 'Backend Engineering',
          growGroupId: 'backend-engineering',
        },
        { id: 'system-security', title: 'System & Security', growGroupId: 'system-security' },
        {
          id: 'frontend-engineering',
          title: 'Frontend Engineering',
          growGroupId: 'frontend-engineering',
        },
        { id: 'cloud-delivery', title: 'Cloud & Delivery', growGroupId: 'cloud-delivery' },
      ],
    },
    {
      id: 'look-ahead',
      title: 'Look Ahead',
      step: '03',
      category: 'Specialized Practices',
      subtitle: 'Prepare for Senior Engineering, Architecture, and Technical Leadership Decisions.',
      topics: [
        { id: 'system-design', title: 'System Design' },
        { id: 'distributed-systems', title: 'Distributed Systems' },
        { id: 'scalability-performance', title: 'Scalability and Performance' },
        { id: 'resilience-production', title: 'Resilience and Production Troubleshooting' },
        { id: 'cloud-architecture', title: 'Cloud Architecture' },
        { id: 'ai-assisted-development', title: 'AI-Assisted Software Development' },
        { id: 'technical-leadership', title: 'Technical Leadership' },
        { id: 'behavioral-star', title: 'Behavioral and STAR Stories' },
        { id: 'project-recruiter', title: 'Project and Recruiter Discussions' },
      ],
    },
  ];

  protected activeStage(): RoadmapStage {
    return this.stages.find((stage) => stage.id === this.selectedStage()) ?? this.stages[0];
  }

  protected selectStage(stage: StageId): void {
    this.selectedStage.set(stage);
  }

  protected onTabKeydown(event: KeyboardEvent, stage: StageId): void {
    const index = this.stages.findIndex((item) => item.id === stage);
    const nextIndex =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % this.stages.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index - 1 + this.stages.length) % this.stages.length
          : -1;
    if (nextIndex < 0) return;

    event.preventDefault();
    const nextStage = this.stages[nextIndex].id;
    this.selectStage(nextStage);
    (
      this.elementRef.nativeElement.querySelector(`#tab-${nextStage}`) as HTMLButtonElement | null
    )?.focus();
  }

  protected selectStageAndScroll(stage: StageId): void {
    this.selectStage(stage);
    document.getElementById('roadmap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
