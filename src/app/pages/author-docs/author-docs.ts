import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  authorDocumentationGroups,
  authorDocumentationLinks,
} from '../../core/author-workspace-nav/author-workspace-links';
import { AuthorWorkspaceNav } from '../../core/author-workspace-nav/author-workspace-nav';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { PlatformHeader } from '../../core/platform-header/platform-header';

/** Documentation home: every protected reference, grouped by the reader who starts there. */
@Component({
  selector: 'app-author-docs',
  imports: [PlatformHeader, RouterLink, AuthorWorkspaceNav, AuthorAdminMenu],
  templateUrl: './author-docs.html',
  styleUrl: './author-docs.css',
})
export class AuthorDocsPage {
  protected readonly groups = authorDocumentationGroups;
  protected readonly pageCount = authorDocumentationLinks.length;
  protected readonly outline = authorDocumentationGroups.map((group) => ({
    label: group.label,
    href: `#docs-${group.id}`,
  }));
}
