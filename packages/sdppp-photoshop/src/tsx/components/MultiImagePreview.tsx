import React, { useState } from 'react';
import { Image, Checkbox, Spin } from 'antd';
import { isVideo, isImage } from '../../utils/fileType';
import './MultiImagePreview.less';

interface MultiImagePreviewProps {
  images: Array<{
    url: string;
    source: string;
    thumbnail_url?: string;
    nativePath?: string;
    metadata?: {
      genByDocument: number;
      boundary: any;
    };
    downloading?: boolean;
  }>;
  selectedImages: Set<number>;
  onImageSelect: (index: number) => void;
  onImageClick: (index: number) => void;
}

export default function MultiImagePreview({ 
  images, 
  selectedImages, 
  onImageSelect, 
  onImageClick 
}: MultiImagePreviewProps) {
  const [loadingImages, setLoadingImages] = useState<Set<number>>(new Set());

  const handleImageLoad = (index: number) => {
    setLoadingImages(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  };

  const handleImageStartLoad = (index: number) => {
    setLoadingImages(prev => new Set(prev).add(index));
  };

  if (!images.length) {
    return null;
  }

  return (
    <div className="multi-image-preview">
      <div className="multi-image-preview__grid">
        {images.map((image, index) => {
          const isSelected = selectedImages.has(index);
          const isLoading = loadingImages.has(index) || image.downloading;
          const isImageFile = isImage(image.url);
          const isVideoFile = isVideo(image.url);

          return (
            <div
              key={`${image.url}-${index}`}
              className={`multi-image-preview__item ${isSelected ? 'multi-image-preview__item--selected' : ''}`}
              onClick={() => {
                console.log('Image container clicked for index:', index);
                onImageClick(index);
              }}
            >
              <div className="multi-image-preview__checkbox">
                <Checkbox
                  checked={isSelected}
                  onClick={(e) => {
                    console.log('Checkbox clicked for index:', index);
                    e.stopPropagation();
                    onImageClick(index);
                  }}
                />
              </div>

              {isLoading && (
                <div className="multi-image-preview__loading">
                  <Spin size="small" />
                </div>
              )}

              {isVideoFile ? (
                <video
                  src={image.url}
                  className="multi-image-preview__media"
                  onLoadStart={() => handleImageStartLoad(index)}
                  onLoadedData={() => handleImageLoad(index)}
                  onError={() => handleImageLoad(index)}
                  onClick={(e) => {
                    e.stopPropagation();
                    const video = e.target as HTMLVideoElement;
                    if (video.paused) {
                      video.play();
                    } else {
                      video.pause();
                    }
                  }}
                />
              ) : isImageFile && image.thumbnail_url ? (
                <Image
                  src={image.thumbnail_url}
                  alt={`Preview ${index + 1}`}
                  className="multi-image-preview__media"
                  preview={false}
                  onLoad={() => handleImageLoad(index)}
                  onError={() => handleImageLoad(index)}
                />
              ) : (
                <div className="multi-image-preview__placeholder">
                  <div className="multi-image-preview__placeholder-text">
                    {isLoading ? 'Loading...' : 'No Preview'}
                  </div>
                </div>
              )}

              <div className="multi-image-preview__overlay">
                <div className="multi-image-preview__index">
                  {index + 1}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
