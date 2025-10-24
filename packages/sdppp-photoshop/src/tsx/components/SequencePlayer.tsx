import React, { useState, useEffect, useRef } from 'react';
import { Button, InputNumber, Image, Tooltip, message } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  DeleteOutlined,
  ClearOutlined,
  LeftOutlined,
  RightOutlined,
  AppstoreOutlined
} from '@ant-design/icons';
import { useTranslation } from '@sdppp/common';
import './SequencePlayer.less';

interface SequencePlayerProps {
  images: Array<{
    url: string;
    thumbnail_url: string;
    nativePath?: string;
    width?: number;
    height?: number;
  }>;
  onRemoveImage: (index: number) => void;
  onClearAll: () => void;
  onSpritesheetGenerated?: (dataUrl: string) => void;
}

export default function SequencePlayer({ images, onRemoveImage, onClearAll, onSpritesheetGenerated }: SequencePlayerProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playInterval, setPlayInterval] = useState(1000); // 默认1秒
  const [rows, setRows] = useState(1); // spritesheet行数
  const [cols, setCols] = useState(1); // spritesheet列数
  const [generatingSpritesheet, setGeneratingSpritesheet] = useState(false);
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

  // 生成spritesheet
  const handleGenerateSpritesheet = async () => {
    if (images.length === 0) {
      message.error('没有图片可以生成spritesheet');
      return;
    }

    if (rows <= 0 || cols <= 0) {
      message.error('行数和列数必须大于0');
      return;
    }

    const totalCells = rows * cols;
    if (totalCells < images.length) {
      message.warning(`当前设置 ${rows}×${cols} = ${totalCells} 个格子，但有 ${images.length} 张图片。将只使用前 ${totalCells} 张图片。`);
    }

    setGeneratingSpritesheet(true);

    try {
      // 加载所有图片
      const loadedImages = await Promise.all(
        images.slice(0, totalCells).map(async (img, index) => {
          return new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new window.Image();
            
            // 优先使用 thumbnail_url，其次 url
            let imageUrl = img.thumbnail_url || img.url;
            
            if (!imageUrl) {
              reject(new Error(`图片 ${index} 没有有效的URL`));
              return;
            }
            
            console.log(`[Spritesheet] 图片 ${index} URL类型:`, {
              url: img.url?.substring(0, 50),
              thumbnail_url: img.thumbnail_url?.substring(0, 50),
              isFile: imageUrl.startsWith('file://'),
              isHttp: imageUrl.startsWith('http'),
              isData: imageUrl.startsWith('data:')
            });
            
            // 不设置 crossOrigin，让浏览器自行处理
            // 这样可以避免 CORS 导致 canvas 污染
            
            image.onload = () => {
              console.log(`[Spritesheet] 图片 ${index} 加载完成，尺寸: ${image.width}×${image.height}`);
              resolve(image);
            };
            
            image.onerror = (e) => {
              console.error(`[Spritesheet] 图片 ${index} 加载失败:`, {
                url: imageUrl.substring(0, 100),
                error: e
              });
              // 尝试使用另一个URL
              if (img.thumbnail_url && img.url && imageUrl === img.thumbnail_url) {
                console.log(`[Spritesheet] 尝试使用 url 字段重新加载图片 ${index}`);
                image.src = img.url;
              } else {
                reject(new Error(`图片 ${index} 加载失败`));
              }
            };
            
            image.src = imageUrl;
          });
        })
      );

      console.log('[Spritesheet] 成功加载了', loadedImages.length, '张图片');

      // 计算单元格尺寸（使用第一张图片的原始尺寸）
      const cellWidth = loadedImages[0].width;
      const cellHeight = loadedImages[0].height;

      console.log('[Spritesheet] 单元格尺寸（原始分辨率）:', cellWidth, 'x', cellHeight);

      // 创建canvas
      const canvas = document.createElement('canvas');
      canvas.width = cols * cellWidth;
      canvas.height = rows * cellHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('无法创建canvas context');
      }

      console.log('[Spritesheet] Canvas总尺寸（原始分辨率）:', canvas.width, 'x', canvas.height);
      console.log('[Spritesheet] 说明：每个单元格', cellWidth, 'x', cellHeight, '| 布局', rows, 'x', cols);

      // 绘制所有图片到canvas（保持原始分辨率，不缩放）
      let imageIndex = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (imageIndex < loadedImages.length) {
            const x = col * cellWidth;
            const y = row * cellHeight;
            const img = loadedImages[imageIndex];
            
            // 使用原始尺寸绘制，保持分辨率
            ctx.drawImage(img, x, y, cellWidth, cellHeight);
            
            console.log(`[Spritesheet] 绘制图片 ${imageIndex}:`, 
              `原始尺寸 ${img.width}×${img.height} → 位置 (${x}, ${y})`);
            imageIndex++;
          }
        }
      }

      // 转换为data URL
      const dataUrl = canvas.toDataURL('image/png');
      
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        throw new Error('Canvas转换为data URL失败');
      }
      
      const fileSizeKB = (dataUrl.length / 1024).toFixed(2);
      console.log('[Spritesheet] 生成完成！');
      console.log('[Spritesheet] - 最终尺寸:', canvas.width, 'x', canvas.height, '像素');
      console.log('[Spritesheet] - 文件大小:', fileSizeKB, 'KB');
      console.log('[Spritesheet] - 单元格尺寸:', cellWidth, 'x', cellHeight);
      console.log('[Spritesheet] - 布局:', rows, '行 x', cols, '列 =', rows * cols, '个格子');

      message.success(`Spritesheet生成成功！尺寸: ${canvas.width}×${canvas.height}像素`);

      // 调用回调函数
      if (onSpritesheetGenerated) {
        console.log('[Spritesheet] 调用回调函数，dataUrl长度:', dataUrl.length);
        onSpritesheetGenerated(dataUrl);
      }

    } catch (error) {
      console.error('[Spritesheet] 生成失败:', error);
      message.error(`生成失败: ${(error as Error)?.message || error}`);
    } finally {
      setGeneratingSpritesheet(false);
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

      {/* Spritesheet生成控制 */}
      <div className="sequence-player__spritesheet">
        <span className="sequence-player__spritesheet-label">
          生成Spritesheet:
        </span>
        <div className="sequence-player__spritesheet-inputs">
          <span className="sequence-player__spritesheet-input-label">行:</span>
          <InputNumber
            min={1}
            max={20}
            value={rows}
            onChange={(value) => setRows(value || 1)}
            style={{ width: 60 }}
          />
          <span className="sequence-player__spritesheet-input-label">列:</span>
          <InputNumber
            min={1}
            max={20}
            value={cols}
            onChange={(value) => setCols(value || 1)}
            style={{ width: 60 }}
          />
          <Tooltip title={`将生成 ${rows}×${cols} = ${rows * cols} 个格子的spritesheet`}>
            <Button
              type="primary"
              icon={<AppstoreOutlined />}
              onClick={handleGenerateSpritesheet}
              loading={generatingSpritesheet}
              disabled={images.length === 0}
            >
              生成 ({rows}×{cols})
            </Button>
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

