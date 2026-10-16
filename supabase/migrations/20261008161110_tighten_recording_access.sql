-- Tighten who can touch recordings, their audio files, and the transcription log.

-- recordings: people read, add, and delete their own. Only the server functions (service role) update
-- rows, since analysis and analyzed_at drive the daily analysis limit.
drop policy if exists "own recordings" on public.recordings;

create policy "Users read their own recordings" on public.recordings
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users add their own recordings" on public.recordings
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users delete their own recordings" on public.recordings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- transcription_events: written only by the transcribe function, which counts them for the daily
-- transcription limit. People can see their own rows but not add or remove them.
drop policy if exists "own transcription events" on public.transcription_events;

create policy "Users read their own transcription events" on public.transcription_events
  for select to authenticated using ((select auth.uid()) = user_id);

-- Audio files: nobody signed out can list or read them, and people can remove files in their own
-- folder (the app deletes the audio when "Save recording" is off).
drop policy if exists "public read impromptu recordings" on storage.objects;

create policy "own recording deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'impromptu-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
