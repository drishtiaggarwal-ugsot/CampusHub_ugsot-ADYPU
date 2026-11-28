'use client';

import { useRef, useState } from 'react';

type Props = {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  label?: string;
};

async function compressImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a PNG, JPEG, WebP, or GIF image file.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });

  if (dataUrl.length <= 280000) {
    return dataUrl;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode the selected image file.'));
    el.src = dataUrl;
  });

  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image resizing is unavailable in this browser.');
  }
  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of [0.82, 0.68, 0.54]) {
    const encoded = canvas.toDataURL('image/jpeg', quality);
    if (encoded.length <= 420000) {
      return encoded;
    }
  }

  throw new Error('Image is still too large after compression. Choose a smaller image or paste an image URL.');
}

export default function EventImageInput({
  id = 'event-image',
  value,
  onChange,
  label = 'Cover image (optional)',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setUploadError('');
    try {
      const compressed = await compressImageFile(file);
      onChange(compressed);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to load image.');
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 650 }}>
          {label}
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn--outline"
            style={{ fontSize: 12, padding: '6px 12px', minHeight: 34 }}
            disabled={processing}
            onClick={() => fileInputRef.current?.click()}
          >
            {processing ? 'Processing…' : 'Upload image file'}
          </button>
          {value && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ fontSize: 12, padding: '6px 10px', minHeight: 34 }}
              onClick={() => {
                onChange('');
                setUploadError('');
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        id={id}
        type="text"
        value={value.startsWith('data:image/') ? '' : value}
        onChange={(e) => {
          setUploadError('');
          onChange(e.target.value);
        }}
        placeholder={
          value.startsWith('data:image/')
            ? 'Uploaded image attached (or paste an image URL to replace)'
            : 'Paste an image URL (https://...) or upload a file above'
        }
        style={{
          width: '100%',
          minHeight: 40,
          padding: '9px 12px',
          borderRadius: 6,
          border: '1px solid var(--border-color, #bbb8ae)',
          background: 'var(--canvas, #fff)',
          color: 'var(--ink, #171717)',
          fontSize: 13,
        }}
      />

      {uploadError && (
        <p className="form-error" role="alert" style={{ margin: 0 }}>
          {uploadError}
        </p>
      )}

      {value && (
        <div
          style={{
            position: 'relative',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid var(--border-color, #d7d4cb)',
            background: 'var(--panel, #f5f4f0)',
            maxWidth: 360,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Event cover preview"
            style={{
              display: 'block',
              width: '100%',
              height: 150,
              objectFit: 'cover',
            }}
          />
        </div>
      )}
    </div>
  );
}
