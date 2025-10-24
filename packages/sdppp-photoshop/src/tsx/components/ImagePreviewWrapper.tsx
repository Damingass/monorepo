import { DeleteOutlined, LeftOutlined, MoreOutlined, RightOutlined, SaveOutlined, SendOutlined, StepForwardOutlined, AppstoreOutlined, UnorderedListOutlined, PlusOutlined, PlusCircleOutlined } from '@ant-design/icons';
import { sdpppSDK, useTranslation } from '@sdppp/common';
import { SyncButton } from '@sdppp/ui-library';
import { Button, Divider, Dropdown } from 'antd';
import React from 'react';
import { isImage } from '../../utils/fileType';
import { MainStore } from '../App.store';
import ImagePreview from './ImagePreview';
import MultiImagePreview from './MultiImagePreview';
import SequencePlayer from './SequencePlayer';

interface ImagePreviewWrapperProps {
  children?: React.ReactNode;
}

export default function ImagePreviewWrapper({ children }: ImagePreviewWrapperProps) {
  const { t } = useTranslation();
  const rawImages = MainStore(state => state.previewImageList);
  const previewMode = MainStore(state => state.previewMode);
  const selectedImages = MainStore(state => state.selectedImages);
  const sequenceFrames = MainStore(state => state.sequenceFrames);
  const setPreviewMode = MainStore(state => state.setPreviewMode);
  const toggleImageSelection = MainStore(state => state.toggleImageSelection);
  const clearImageSelection = MainStore(state => state.clearImageSelection);
  const addToSequenceFrames = MainStore(state => state.addToSequenceFrames);
  const removeSequenceFrame = MainStore(state => state.removeSequenceFrame);
  const clearSequenceFrames = MainStore(state => state.clearSequenceFrames);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const [sendingAll, setSendingAll] = React.useState(false);
  const [isShiftPressed, setIsShiftPressed] = React.useState(false);
  const [isAutoSync, setIsAutoSync] = React.useState(false);
  const [loadingFromLayer, setLoadingFromLayer] = React.useState(false);
  const isShiftPressedRef = React.useRef(false);
  const pendingAutoSendRef = React.useRef(new Map<string, { cancel: boolean }>());

  // 确保 thumbnail_url 总是有值
  const images = React.useMemo(() => {
    const result = rawImages.map((img, idx) => {
      const processed = {
        ...img,
        thumbnail_url: img.thumbnail_url || img.url
      };
      
      // 调试最后添加的图像
      if (idx === rawImages.length - 1 && img.source === 'layer-import') {
        console.log('[ImagePreviewWrapper] useMemo处理最新PS图层导入:', {
          '原始url': img.url?.substring(0, 60) + '...',
          '原始thumbnail_url': img.thumbnail_url?.substring(0, 60) + '...',
          '原始nativePath': img.nativePath,
          '处理后thumbnail_url': processed.thumbnail_url?.substring(0, 60) + '...',
          '是否有thumbnail_url': !!processed.thumbnail_url,
          '是否有url': !!img.url
        });
      }
      
      return processed;
    });
    
    return result;
  }, [rawImages]);

  const currentItem = images[currentIndex];
  // 从图层导入的图片默认认为是图片类型，即使URL可能没有扩展名
  const isCurrentItemImage = currentItem ? (currentItem.source === 'layer-import' || isImage(currentItem.url)) : false;

  // Get boundary display text (similar to WorkBoundary.tsx)
  const getBoundaryText = (boundary: any): string => {
    if (!boundary || (boundary.width >= 999999 && boundary.height >= 999999)) {
      return t('boundary.current_canvas', {defaultMessage: 'Entire Canvas'});
    }
    return `(${boundary.leftDistance}, ${boundary.topDistance}, ${boundary.width}, ${boundary.height})`;
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  // Internal helper to send a specific index
  const sendToPSAtIndex = async (index: number, opts?: { shiftKey?: boolean }) => {
    try {
      setSending(true);
      const type = opts?.shiftKey ? ('newdoc' as const) : ('smartobject' as const);
      const imageToSend = images[index];
      
      const importParams = {
        nativePath: imageToSend.nativePath || imageToSend.url,
        boundary: imageToSend.boundary ?? 'canvas',
        type,
        sourceWidth: (images as any)[index]?.width,
        sourceHeight: (images as any)[index]?.height
      };
      
      console.log('[导入到PS] 开始导入图像:', {
        index,
        source: imageToSend.source,
        imageData: {
          nativePath: imageToSend.nativePath,
          url: imageToSend.url,
          boundary: imageToSend.boundary,
        },
        importParams
      });
      
      // 检查nativePath是否有效
      if (!importParams.nativePath) {
        const errorMsg = '图像路径为空，无法导入';
        console.error('[导入到PS]', errorMsg);
        alert(errorMsg);
        return;
      }
      
      const result = await sdpppSDK.plugins.photoshop.importImage(importParams);
      
      console.log('[导入到PS] 导入成功，返回结果:', result);
    } catch (error) {
      console.error('[导入到PS] 导入失败，详细错误:', error);
      console.error('[导入到PS] 错误堆栈:', (error as Error)?.stack);
      alert(`导入失败: ${(error as Error)?.message || error}`);
      throw error;
    } finally {
      setSending(false);
    }
  };

  const handleSendToPS = async (event?: { shiftKey?: boolean }) => {
    await sendToPSAtIndex(currentIndex, { shiftKey: !!event?.shiftKey });
  };

  // 从图层导入图片 - 使用 file_token + getImageBase64 获取完整分辨率
  const handleImportFromLayer = async () => {
    try {
      setLoadingFromLayer(true);

      const currentList = MainStore.getState().previewImageList;
      const activeDocID = sdpppSDK.stores.PhotoshopStore.getState().activeDocumentID;
      const webviewState = sdpppSDK.stores.WebviewStore.getState() as any;
      const boundary = webviewState.workBoundaries?.[activeDocID] || 'curlayer';
      const workBoundaryMaxSizes = webviewState.workBoundaryMaxSizes || {};
      const maxImageSize = workBoundaryMaxSizes[activeDocID] ||
                          sdpppSDK.stores.PhotoshopStore.getState().sdpppX?.['settings.imaging.defaultImagesSizeLimit'] || 
                          4096;
      
      console.log('[handleImportFromLayer] 开始获取图层数据', {
        boundary,
        maxImageSize
      });
      
      // 第1步：调用 getImage 获取 file_token（完整分辨率令牌）
      const imageResult = await sdpppSDK.plugins.photoshop.getImage({
        boundary: boundary,
        content: 'curlayer',
        imageSize: maxImageSize,
        imageQuality: 100,
        cropBySelection: 'no' as const,
        SkipNonNormalLayer: true
      });

      if (imageResult.error) {
        console.error('[handleImportFromLayer] getImage 错误:', imageResult.error);
        alert(`获取图层失败: ${imageResult.error}`);
        setLoadingFromLayer(false);
        return;
      }
      
      const file_token = imageResult.file_token;
      const thumbnailUrl = imageResult.thumbnail_url;
      
      console.log('[handleImportFromLayer] getImage 返回结果:', {
        hasFileToken: !!file_token,
        hasThumbnailUrl: !!thumbnailUrl,
        file_token: typeof file_token === 'string' ? file_token.substring(0, 100) : file_token
      });
      
      // 第2步：使用 file_token 获取完整分辨率 base64（对齐 ComfyUI 流程）
      let fullResolutionDataUrl = thumbnailUrl || '';
      
      // 检查 file_token 是否有效（不应该是包含 boundary 的 JSON 字符串）
      if (file_token && typeof file_token === 'string' && !file_token.includes('boundary')) {
        try {
          console.log('[handleImportFromLayer] 使用 file_token 获取完整分辨率 base64...');
          
          const base64Result = await sdpppSDK.plugins.photoshop.getImageBase64({ 
            token: file_token 
          });
          
          if (base64Result.error) {
            console.warn('[handleImportFromLayer] getImageBase64 错误，回退到 thumbnail_url:', base64Result.error);
          } else if (base64Result.base64) {
            let base64String = base64Result.base64;
            const mimeType = base64Result.mimeType || 'image/png';
            
            // 检查 base64 字符串是否已经包含 data URL 前缀
            if (base64String.startsWith('data:')) {
              // 已经是完整的 data URL，直接使用
              fullResolutionDataUrl = base64String;
              console.log('[handleImportFromLayer] base64已包含data URL前缀，直接使用', {
                prefix: base64String.substring(0, 50),
                base64Length: base64String.length
              });
            } else {
              // 需要移除可能存在的其他前缀并重新构造 data URL
              // 去除所有可能的 data:image/* 前缀（参考Java代码）
              base64String = base64String
                .replace(/^data:image\/\w+;base64,/, '')  // 去除任何 data:image/*;base64, 前缀
                .replace(/\s/g, '+');  // 将空格替换回 +（Ajax传输可能导致的问题）
              
              // 构造正确的 data URL
              fullResolutionDataUrl = `data:${mimeType};base64,${base64String}`;
              console.log('[handleImportFromLayer] 清理base64并添加前缀', {
                mimeType,
                originalLength: base64Result.base64.length,
                cleanedLength: base64String.length,
                preview: base64String.substring(0, 50)
              });
            }
          }
        } catch (error) {
          console.warn('[handleImportFromLayer] getImageBase64 异常，回退到 thumbnail_url:', error);
        }
      } else {
        console.warn('[handleImportFromLayer] file_token 无效，使用 thumbnail_url（可能是低分辨率）');
      }
      
      if (!fullResolutionDataUrl) {
        console.error('[handleImportFromLayer] 既没有 file_token 也没有 thumbnail_url');
        alert('获取图层数据失败');
        setLoadingFromLayer(false);
        return;
      }
      
      // 第3步：使用 downloadImage 保存完整分辨率数据到本地永久文件（对齐 ComfyUI 流程）
      console.log('[handleImportFromLayer] 调用 downloadImage 保存到本地...', {
        urlType: fullResolutionDataUrl.startsWith('data:') ? 'data URL' : 'file URL',
        urlLength: fullResolutionDataUrl.length
      });
      
      const downloadResult = await sdpppSDK.plugins.photoshop.downloadImage({ 
        url: fullResolutionDataUrl 
      });
      
      if ('error' in downloadResult && downloadResult.error) {
        console.error('[handleImportFromLayer] downloadImage 错误:', downloadResult.error);
        alert(`保存图片失败: ${downloadResult.error}`);
        setLoadingFromLayer(false);
        return;
      }
      
      const nativePath = downloadResult.nativePath;
      let displayUrl = downloadResult.thumbnail_url;
      
      // 如果 downloadImage 没有返回 thumbnail_url，从 nativePath 生成 file:// URL
      if (!displayUrl && nativePath) {
        const normalizedPath = nativePath.replace(/\\/g, '/');
        displayUrl = `file:///${normalizedPath}`;
      }
      
      if (!nativePath || !displayUrl) {
        console.error('[handleImportFromLayer] 缺少必要的路径信息');
        alert('保存图片失败');
        setLoadingFromLayer(false);
        return;
      }
      
      console.log('[handleImportFromLayer] downloadImage 成功返回:', {
        nativePath,
        displayUrl: displayUrl.substring(0, 100),
        width: downloadResult.width,
        height: downloadResult.height
      });
      
      // 第4步：保存到 store
      const newImage = {
        url: displayUrl,
        thumbnail_url: displayUrl,
        nativePath: nativePath,
        source: 'layer-import',
        docId: activeDocID,
        boundary: boundary,
        width: downloadResult.width,
        height: downloadResult.height,
        downloading: false
      };
      
      MainStore.setState({
        previewImageList: [...currentList, newImage]
      });
      
      console.log('[handleImportFromLayer] ✅ 成功导入图层（完整分辨率）', {
        nativePath,
        width: newImage.width,
        height: newImage.height,
        resolution: `${newImage.width}×${newImage.height}`
      });
      
    } catch (error) {
      console.error('[handleImportFromLayer] 异常:', error);
      alert(`导入图层失败: ${(error as Error)?.message || error}`);
    } finally {
      setLoadingFromLayer(false);
    }
  };

  // Send by URL using nativePath once ready
  const sendNativeImageByUrl = async (url: string) => {
    try {
      setSending(true);
      const list = MainStore.getState().previewImageList;
      const item = list.find(it => it.url === url);
      if (!item || !item.nativePath) {
        return;
      }
      const type = isShiftPressedRef.current ? 'newdoc' : 'smartobject';
      await sdpppSDK.plugins.photoshop.importImage({
        nativePath: item.nativePath,
        boundary: item.boundary ?? 'canvas',
        type,
        sourceWidth: (item as any)?.width,
        sourceHeight: (item as any)?.height,
      });
    } finally {
      setSending(false);
    }
  };

  const handleDeleteCurrent = () => {
    const newImages = images.filter((_, index) => index !== currentIndex);
    MainStore.setState({ previewImageList: newImages });
    if (currentIndex >= newImages.length && newImages.length > 0) {
      setCurrentIndex(newImages.length - 1);
    }
  };

  const handleClearAll = () => {
    MainStore.setState({ previewImageList: [] });
  };

  const handleSendAll = async (event?: React.MouseEvent) => {
    setSendingAll(true);
    try {
      const imageItems = images.filter(image => isImage(image.url));
      if (imageItems.length === 0) {
        return;
      }

      const type = event?.shiftKey ? 'newdoc' : 'smartobject';
      const promises = imageItems.map(image =>
        sdpppSDK.plugins.photoshop.importImage({
          nativePath: image.nativePath || image.url,
          boundary: image.boundary ?? 'canvas',
          type: type,
          sourceWidth: (image as any)?.width,
          sourceHeight: (image as any)?.height
        })
      );
      await Promise.all(promises);
    } finally {
      setSendingAll(false);
    }
  };

  const handleSaveAll = () => {
    const nativePaths = images.map(image => image.nativePath).filter((path): path is string => !!path);
    if (nativePaths.length > 0) {
      sdpppSDK.plugins.photoshop.requestAndDoSaveImage({
        nativePaths
      });
    }
  };

  const handleSaveCurrent = async () => {
    if (currentItem?.nativePath) {
      await sdpppSDK.plugins.photoshop.requestAndDoSaveImage({
        nativePaths: [currentItem.nativePath]
      });
    }
  };

  const handleJumpToLast = () => {
    if (images.length > 0) {
      setCurrentIndex(images.length - 1);
    }
  };

  // Multi-image preview handlers
  const handleImageSelect = (index: number) => {
    toggleImageSelection(index);
  };

  const handleImageClick = (index: number) => {
    if (previewMode === 'multi') {
      setCurrentIndex(index);
      setPreviewMode('single');
    }
  };

  const handleSendSelected = async (event?: React.MouseEvent) => {
    if (selectedImages.size === 0) return;
    
    setSendingAll(true);
    try {
      const selectedImageItems = Array.from(selectedImages)
        .map(index => images[index])
        .filter(image => isImage(image.url));
      
      if (selectedImageItems.length === 0) {
        return;
      }

      const type = event?.shiftKey ? 'newdoc' : 'smartobject';
      const promises = selectedImageItems.map(image =>
        sdpppSDK.plugins.photoshop.importImage({
          nativePath: image.nativePath || image.url,
          boundary: image.boundary ?? 'canvas',
          type: type,
          sourceWidth: (image as any)?.width,
          sourceHeight: (image as any)?.height
        })
      );
      await Promise.all(promises);
    } finally {
      setSendingAll(false);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedImages.size === 0) return;
    
    const selectedIndices = Array.from(selectedImages).sort((a, b) => b - a);
    const newImages = images.filter((_, index) => !selectedImages.has(index));
    MainStore.setState({ previewImageList: newImages });
    clearImageSelection();
    
    // Adjust current index if needed
    if (currentIndex >= newImages.length && newImages.length > 0) {
      setCurrentIndex(newImages.length - 1);
    }
  };

  const handleSelectAll = () => {
    const allIndices = new Set(images.map((_, index) => index));
    MainStore.setState({ selectedImages: allIndices });
  };

  const handleClearSelection = () => {
    clearImageSelection();
  };

  // 添加到序列帧
  const handleAddCurrentToSequence = () => {
    if (currentItem) {
      addToSequenceFrames([{
        url: currentItem.url,
        thumbnail_url: currentItem.thumbnail_url || currentItem.url,
        nativePath: currentItem.nativePath,
        width: (currentItem as any)?.width,
        height: (currentItem as any)?.height
      }]);
    }
  };

  const handleAddSelectedToSequence = () => {
    if (selectedImages.size === 0) return;
    
    const selectedImageItems = Array.from(selectedImages)
      .map(index => images[index])
      .map(img => ({
        url: img.url,
        thumbnail_url: img.thumbnail_url || img.url,
        nativePath: img.nativePath,
        width: (img as any)?.width,
        height: (img as any)?.height
      }));
    
    addToSequenceFrames(selectedImageItems);
    clearImageSelection();
  };

  // 处理spritesheet生成
  const handleSpritesheetGenerated = async (dataUrl: string) => {
    console.log('[Spritesheet] 开始保存生成的spritesheet');
    
    try {
      // 使用downloadImage保存data URL到永久位置
      const downloadResult = await sdpppSDK.plugins.photoshop.downloadImage({ url: dataUrl });
      
      console.log('[Spritesheet] downloadImage 返回结果:', downloadResult);

      if ('error' in downloadResult && downloadResult.error) {
        console.error('[Spritesheet] 保存失败:', downloadResult.error);
        alert(`保存失败: ${downloadResult.error}`);
        return;
      }

      const nativePath = downloadResult.nativePath;
      const displayUrl = downloadResult.thumbnail_url || dataUrl;

      console.log('[Spritesheet] 获得永久路径:', {
        nativePath,
        displayUrl,
        width: downloadResult.width,
        height: downloadResult.height
      });

      if (!nativePath) {
        console.error('[Spritesheet] downloadImage没有返回nativePath');
        alert('保存spritesheet失败');
        return;
      }

      // 获取当前状态
      const currentList = MainStore.getState().previewImageList;
      const activeDocID = sdpppSDK.stores.PhotoshopStore.getState().activeDocumentID;
      const webviewState = sdpppSDK.stores.WebviewStore.getState() as any;
      const boundary = webviewState.workBoundaries?.[activeDocID] || 'canvas';
      
      // 添加到预览列表
      const newImage = {
        url: displayUrl,
        thumbnail_url: displayUrl,
        nativePath: nativePath,
        source: 'spritesheet',
        docId: activeDocID,
        boundary: boundary,
        width: downloadResult.width,
        height: downloadResult.height,
        downloading: false
      };
      
      console.log('[Spritesheet] 添加到预览列表:', newImage);
      
      MainStore.setState({
        previewImageList: [...currentList, newImage]
      });

      console.log('[Spritesheet] Spritesheet已成功添加到预览列表');
      
    } catch (error) {
      console.error('[Spritesheet] 保存失败，异常详情:', error);
      alert(`保存异常: ${(error as Error)?.message}`);
    }
  };

  const [prevLength, setPrevLength] = React.useState(images.length);
  React.useEffect(() => {
    if (currentIndex === prevLength - 1 && images.length > prevLength) {
      handleNext();
    }
    setPrevLength(images.length);
  }, [images.length, currentIndex]);

  // Auto-send newly received images when auto is active, waiting for nativePath
  const autoPrevLenRef = React.useRef(images.length);
  const scheduleAutoSendForUrl = (url: string) => {
    if (pendingAutoSendRef.current.has(url)) return;
    const token = { cancel: false };
    pendingAutoSendRef.current.set(url, token);
    (async () => {
      try {
        while (!token.cancel && isAutoSync) {
          const list = MainStore.getState().previewImageList;
          const item = list.find(it => it.url === url);
          if (!item) break; // deleted
          const downloading = (item as any)?.downloading === true;
          if (!downloading && !!item.nativePath) {
            await sendNativeImageByUrl(url);
            break;
          }
          await new Promise(res => setTimeout(res, 200));
        }
      } finally {
        pendingAutoSendRef.current.delete(url);
      }
    })();
  };
  React.useEffect(() => {
    if (!isAutoSync) {
      // cancel all pending tasks when auto-sync turns off
      pendingAutoSendRef.current.forEach(t => (t.cancel = true));
      pendingAutoSendRef.current.clear();
      autoPrevLenRef.current = images.length;
      return;
    }
    if (images.length > autoPrevLenRef.current) {
      for (let i = autoPrevLenRef.current; i < images.length; i++) {
        const itm = images[i];
        if (itm && isImage(itm.url)) {
          scheduleAutoSendForUrl(itm.url);
        }
      }
    }
    autoPrevLenRef.current = images.length;
  }, [images.length, isAutoSync]);

  // keep ref updated for shift key state used in async tasks
  React.useEffect(() => {
    isShiftPressedRef.current = isShiftPressed;
  }, [isShiftPressed]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      // cancel pending tasks on unmount
      pendingAutoSendRef.current.forEach(t => (t.cancel = true));
      pendingAutoSendRef.current.clear();
    };
  }, []);

  const actionButtons = {
    modeToggle: (
      <Button
        className="image-preview__mode-toggle"
        type="text"
        icon={previewMode === 'single' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
        onClick={() => setPreviewMode(previewMode === 'single' ? 'multi' : 'single')}
        size="middle"
        title={previewMode === 'single' ? t('image.switch_to_multi', {defaultMessage: 'Switch to Multi View'}) : t('image.switch_to_single', {defaultMessage: 'Switch to Single View'})}
      />
    ),
    importFromLayer: (
      <Button
        className={`image-preview__import-from-layer ${!images.length ? 'always-visible' : ''}`}
        type="text"
        icon={<PlusOutlined />}
        onClick={handleImportFromLayer}
        loading={loadingFromLayer}
        size="middle"
        title={t('image.import_from_layer', {defaultValue: '从图层导入'})}
      />
    ),
    prev: images.length > 1 ? (
      <Button
        className="image-preview__nav image-preview__nav--prev"
        icon={<LeftOutlined />}
        onClick={handlePrev}
        shape="circle"
        size="middle"
      />
    ) : null,
    next: images.length > 1 ? (
      <Button
        className="image-preview__nav image-preview__nav--next"
        icon={<RightOutlined />}
        onClick={handleNext}
        shape="circle"
        size="middle"
      />
    ) : null,
    jumpToLast: currentIndex < images.length - 1 ? (
      <Button
        className="image-preview__floating-btn--jump"
        icon={<StepForwardOutlined />}
        onClick={handleJumpToLast}
        shape="circle"
        size="middle"
        title={t('image.jump_to_last')}
      />
    ) : null,
    deleteCurrent: (
      <Button
        className="image-preview__floating-btn--delete"
        icon={<DeleteOutlined />}
        onClick={handleDeleteCurrent}
        shape="circle"
        size="middle"
        title={t('image.delete_current')}
      />
    ),
    indicator: (
      <div className="image-preview__indicator">
        {currentIndex + 1} / {images.length}
      </div>
    ),
    bottomDeleteAll: (
      <Button
        className="image-preview__bottom-delete-all"
        icon={<DeleteOutlined />}
        onClick={handleClearAll}
        shape="circle"
        size="large"
        title={t('image.clear_all')}
      />
    ),
    bottomDeleteCurrent: (
      <div className="image-preview__bottom-delete-current" style={{ background: 'transparent', boxShadow: 'none', color: 'inherit' }}>
        <Button
          icon={<DeleteOutlined />}
          onClick={handleDeleteCurrent}
          size="middle"
          type="default"
          style={{ width: '56px' }}
          title={t('image.delete_current')}
        />
      </div>
    ),
    bottomSend: isCurrentItemImage ? (
      <div className="image-preview__bottom-send">
        <SyncButton
          disabled={sending || sendingAll}
          isAutoSync={isAutoSync}
          onSync={({ altKey, shiftKey }) => handleSendToPS({ shiftKey })}
          onAutoSyncToggle={() => setIsAutoSync(prev => !prev)}
          buttonWidth={88}
          mainButtonType="primary"
          autoSyncButtonTooltips={{
            enabled: t('image.auto_send_enabled'),
            disabled: t('image.auto_send_disabled')
          }}
          syncButtonTooltip={t('image.import_as_smartobject') + ' | ' + t('image.import_tip')}
          data-testid="image-preview-sync-button"
        >
          {sending ? t('image.sending') : <SendOutlined />}
        </SyncButton>
      </div>
    ) : (
      <Button
        className="image-preview__bottom-save"
        type="primary"
        onClick={handleSaveCurrent}
        size="middle"
        style={{ width: '56px' }}
      >
        <SaveOutlined />
      </Button>
    ),
    bottomIndicator: previewMode === 'single' ? (
      <Dropdown
        menu={{
          items: [
            {
              key: 'addToSequence',
              label: '添加到序列帧',
              icon: <PlusCircleOutlined />,
              onClick: handleAddCurrentToSequence
            },
            {
              type: 'divider'
            },
            {
              key: 'saveCurrent',
              label: t('image.save_current'),
              icon: <SaveOutlined />,
              onClick: handleSaveCurrent
            },
            {
              key: 'saveAll',
              label: t('image.save_all'),
              icon: <SaveOutlined />,
              onClick: handleSaveAll
            },
            {
              type: 'divider'
            },
            {
              key: 'clearAll',
              label: t('image.clear_all'),
              icon: <DeleteOutlined />,
              onClick: handleClearAll
            }
          ]
        }}
        placement="topRight"
        trigger={['hover']}
        overlayStyle={{ minWidth: 'auto', width: 'max-content' }}
      >
        <div className="image-preview__bottom-indicator" style={{ cursor: 'pointer' }}>
          {currentIndex + 1} / {images.length} <MoreOutlined />
        </div>
      </Dropdown>
    ) : (
      <Dropdown
        menu={{
          items: [
            {
              key: 'addSelectedToSequence',
              label: '添加选中到序列帧',
              icon: <PlusCircleOutlined />,
              onClick: handleAddSelectedToSequence,
              disabled: selectedImages.size === 0
            },
            {
              type: 'divider'
            },
            {
              key: 'selectAll',
              label: t('image.select_all', {defaultMessage: 'Select All'}),
              onClick: handleSelectAll
            },
            {
              key: 'clearSelection',
              label: t('image.clear_selection', {defaultMessage: 'Clear Selection'}),
              onClick: handleClearSelection
            },
            {
              type: 'divider'
            },
            {
              key: 'saveAll',
              label: t('image.save_all'),
              icon: <SaveOutlined />,
              onClick: handleSaveAll
            },
            {
              type: 'divider'
            },
            {
              key: 'clearAll',
              label: t('image.clear_all'),
              icon: <DeleteOutlined />,
              onClick: handleClearAll
            }
          ]
        }}
        placement="topRight"
        trigger={['hover']}
        overlayStyle={{ minWidth: 'auto', width: 'max-content' }}
      >
        <div className="image-preview__bottom-indicator" style={{ cursor: 'pointer' }}>
          {selectedImages.size} / {images.length} <MoreOutlined />
        </div>
      </Dropdown>
    ),
    bottomMultiActions: previewMode === 'multi' && selectedImages.size > 0 ? (
      <div className="image-preview__bottom-multi-actions">
        <Button
          className="image-preview__bottom-delete-selected"
          icon={<DeleteOutlined />}
          onClick={handleDeleteSelected}
          size="middle"
          style={{ width: '56px' }}
          title={t('image.delete_selected', {defaultMessage: 'Delete Selected'})}
        />
        <SyncButton
          disabled={sendingAll}
          isAutoSync={false}
          onSync={({ shiftKey }) => handleSendSelected({ shiftKey } as any)}
          onAutoSyncToggle={() => {}}
          buttonWidth={88}
          mainButtonType="primary"
          syncButtonTooltip={t('image.import_selected_as_smartobject', {defaultMessage: 'Import Selected as Smart Object'}) + ' | ' + t('image.import_tip')}
        >
          {sendingAll ? t('image.sending') : <SendOutlined />}
        </SyncButton>
      </div>
    ) : null
  };

  // 如果没有图片，只显示导入按钮和空状态
  if (!images.length) {
    return (
      <>
        <div className="image-preview">
          {actionButtons.importFromLayer}
          <div className="image-preview__container" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '200px',
            color: 'var(--sdppp-host-text-color-secondary)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <PlusOutlined style={{ fontSize: 48, opacity: 0.3, marginBottom: 16 }} />
              <p>点击右上角的 + 按钮从图层导入图片</p>
            </div>
          </div>
        </div>
        <Divider />
        
        {/* 序列帧播放器 */}
        <SequencePlayer
          images={sequenceFrames}
          onRemoveImage={removeSequenceFrame}
          onClearAll={clearSequenceFrames}
        />
        <Divider />
      </>
    );
  }

  return (
    <>
      <div className="image-preview">
        {actionButtons.modeToggle}
        {actionButtons.importFromLayer}

        {previewMode === 'single' ? (
          <div className="image-preview__container">
            <ImagePreview
              images={images}
              currentIndex={currentIndex}
              onIndexChange={setCurrentIndex}
            />

            {actionButtons.prev}

            <div className="image-preview__right-buttons">
              {actionButtons.next}
              {actionButtons.jumpToLast}
            </div>
          </div>
        ) : (
          <div className="image-preview__multi-container">
            <MultiImagePreview
              images={images}
              selectedImages={selectedImages}
              onImageSelect={handleImageSelect}
              onImageClick={handleImageClick}
            />
          </div>
        )}

        {actionButtons.bottomIndicator}
        {previewMode === 'single' && actionButtons.bottomDeleteCurrent}
        {previewMode === 'single' && actionButtons.bottomSend}
        {actionButtons.bottomMultiActions}
      </div>
      <Divider />
      
      {/* 序列帧播放器 */}
      <SequencePlayer
        images={sequenceFrames}
        onRemoveImage={removeSequenceFrame}
        onClearAll={clearSequenceFrames}
        onSpritesheetGenerated={handleSpritesheetGenerated}
      />
      <Divider />
    </>
  );
}
