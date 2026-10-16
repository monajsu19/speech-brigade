-- Recordings are only playable through signed links made by their owner (see AudioPlayer in app/page.tsx).
-- Apply after the app version that plays signed links is live, or older versions can't play audio.
update storage.buckets set public = false where id = 'impromptu-recordings';
