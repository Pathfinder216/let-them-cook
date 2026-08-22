import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStepMedia, uploadStepMedia, deleteStepMedia } from '../api/media';
import { useMediaVisibility } from '../hooks/useMediaVisibility';

interface StepMediaProps {
  stepId: string;
  /** Read-only display mode (no upload/delete controls) */
  readOnly?: boolean;
}

export function StepMedia({ stepId, readOnly = false }: StepMediaProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  const { showMedia } = useMediaVisibility();

  const { data: media = null } = useQuery({
    queryKey: ['step-media', stepId],
    queryFn: () => fetchStepMedia(stepId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadStepMedia(stepId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['step-media', stepId] });
      setUploadError('');
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => deleteStepMedia(stepId, mediaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['step-media', stepId] }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  }

  // ── Read-only (detail / cook mode) — respects the media visibility toggle ─
  if (readOnly) {
    if (!showMedia || !media) return null;
    if (media.type === 'video') {
      return (
        <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 aspect-video">
          <video src={media.path} controls autoPlay muted playsInline className="w-full h-full object-cover" />
        </div>
      );
    }
    return (
      <div className="mt-3 rounded-lg overflow-hidden border border-gray-200">
        <img src={media.path} alt="" className="w-full object-cover max-h-64" />
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  if (media) {
    return (
      <div className="mt-2">
        <div className="relative group inline-block">
          {media.type === 'video' ? (
            <video src={media.path} className="h-24 w-40 object-cover rounded-lg border border-gray-200" />
          ) : (
            <img src={media.path} alt="" className="h-24 w-40 object-cover rounded-lg border border-gray-200" />
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
            <label className="cursor-pointer bg-white text-gray-800 text-xs font-medium px-2 py-1 rounded shadow">
              Change
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="sr-only"
                onChange={handleFileChange}
                disabled={uploadMutation.isPending}
              />
            </label>
            <button
              onClick={() => deleteMutation.mutate(media.id)}
              disabled={deleteMutation.isPending}
              className="bg-white text-red-600 text-xs font-medium px-2 py-1 rounded shadow"
            >
              Remove
            </button>
          </div>
        </div>
        {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="sr-only"
          onChange={handleFileChange}
          disabled={uploadMutation.isPending}
        />
        {uploadMutation.isPending ? 'Uploading…' : '+ Add photo / video'}
      </label>
      {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
    </div>
  );
}
