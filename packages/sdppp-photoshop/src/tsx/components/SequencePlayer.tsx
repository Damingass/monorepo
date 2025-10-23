import React, { useState, useEffect, useRef } from 'react';
import { Button, InputNumber, Image, Tooltip } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  DeleteOutlined,
  ClearOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';
import { useTranslation } from '@sdppp/common';
import './SequencePlayer.less';

interface SequencePlayerProps {
  images: Array<{
    url: string;
    thumbnail_url: string;
    nativePath?: string;
  }>;
  onRemoveImage: (index: number) => void;
  onClearAll: () => void;
}

export default function SequencePlayer({ images, onRemoveImage, onClearAll }: SequencePlayerProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playInterval, setPlayInterval] = useState(1000); // 默认1秒
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // 播放逻辑
  useEffect(() => {
    if (isPlaying && images.length > 0) {
      timerRef.current = globalThis.setInterval(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1;
          return next >= images.length ? 0 : next;
        });
      }, playInterval) as any;
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, playInterval, images.length]);

  // 当图片列表变空时停止播放
  useEffect(() => {
    if (images.length === 0) {
      setIsPlaying(false);
      setCurrentIndex(0);
    } else if (currentIndex >= images.length) {
      setCurrentIndex(images.length - 1);
    }
  }, [images.length, currentIndex]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleIntervalChange = (value: number | null) => {
    if (value && value > 0) {
      setPlayInterval(value);
    }
  };

  if (images.length === 0) {
    return (
      <div className="sequence-player sequence-player--empty">
        <div className="sequence-player__empty-hint">
          从上方图像预览中选择图片添加到序列帧
        </div>
      </div>
    );
  }

  return (
    <div className="sequence-player">
      {/* 主预览区 */}
      <div className="sequence-player__preview">
        {images[currentIndex] && (
          <Image
            src={images[currentIndex].thumbnail_url || images[currentIndex].url}
            alt={`Sequence ${currentIndex + 1}`}
            preview={false}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
          />
        )}
      </div>

      {/* 控制栏 */}
      <div className="sequence-player__controls">
        <div className="sequence-player__controls-left">
          <Tooltip title="上一帧">
            <Button
              icon={<LeftOutlined />}
              onClick={handlePrev}
              disabled={images.length <= 1}
            />
          </Tooltip>
          
          <Tooltip title={isPlaying ? '暂停' : '播放'}>
            <Button
              type={isPlaying ? 'primary' : 'default'}
              icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={handlePlayPause}
              disabled={images.length <= 1}
            />
          </Tooltip>

          <Tooltip title="下一帧">
            <Button
              icon={<RightOutlined />}
              onClick={handleNext}
              disabled={images.length <= 1}
            />
          </Tooltip>

          <span className="sequence-player__frame-info">
            {currentIndex + 1} / {images.length}
          </span>
        </div>

        <div className="sequence-player__controls-right">
          <span className="sequence-player__interval-label">
            间隔(毫秒):
          </span>
          <InputNumber
            min={100}
            max={10000}
            step={100}
            value={playInterval}
            onChange={handleIntervalChange}
            style={{ width: 100 }}
          />

          <Tooltip title="清空所有">
            <Button
              icon={<ClearOutlined />}
              onClick={onClearAll}
              danger
            />
          </Tooltip>
        </div>
      </div>

      {/* 缩略图列表 */}
      <div className="sequence-player__thumbnails">
        {images.map((image, index) => (
          <div
            key={index}
            className={`sequence-player__thumbnail ${
              index === currentIndex ? 'sequence-player__thumbnail--active' : ''
            }`}
            onClick={() => setCurrentIndex(index)}
          >
            <Image
              src={image.thumbnail_url || image.url}
              alt={`Frame ${index + 1}`}
              preview={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
            <div className="sequence-player__thumbnail-index">{index + 1}</div>
            <Button
              className="sequence-player__thumbnail-delete"
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveImage(index);
              }}
              danger
            />
          </div>
        ))}
      </div>
    </div>
  );
}

