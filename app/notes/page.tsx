'use client';

import { LoginGuard } from '@/components/login-guard';
import { NotesPage } from '@/components/notes-page';

/**
 * Notes about the app — ideas, to-dos, and decisions — linked from the footer.
 */
export default function Notes() {
  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <h1 className="text-xl font-semibold">Notes</h1>
      <LoginGuard>{(secretHash) => <NotesPage secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}
