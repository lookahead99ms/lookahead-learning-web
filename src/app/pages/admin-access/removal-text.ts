/**
 * The words beside Disable, Enable and Delete (DLV-969, user 2026-11-03), shared by People and by Reject on Waiting
 * for access (DLV-971, owner 2026-11-06), so both places say the same thing about the same action.
 */
export const REMOVAL_TEXT = {
  disable: 'Strongest. Blocks every sign-in, with email or Google, and closes their open DEV session within 5 minutes. They cannot ask for access again until you enable them.',
  enable: 'Lets them sign in again with the same account, roles and progress.',
  remove: 'Removes them from sign-in and erases their plans and progress. If they sign in again with the same email or Google account, they appear in Waiting for access as a new person.',
} as const;

/** The same two actions on a request that was never admitted: no session to close, no progress to erase. */
export const REJECT_TEXT = {
  disable: 'Strongest. Blocks every sign-in, with email or Google. They cannot ask for access again until you enable them on People.',
  remove: 'Removes the request and their sign-in. If they sign in again with the same email or Google account, they appear here as a new person.',
} as const;
