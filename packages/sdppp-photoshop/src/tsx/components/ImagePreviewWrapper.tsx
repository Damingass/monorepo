import { DeleteOutlined, LeftOutlined, MoreOutlined, RightOutlined, SaveOutlined, SendOutlined, StepForwardOutlined, AppstoreOutlined, UnorderedListOutlined, PlusOutlined } from '@ant-design/icons';
import { sdpppSDK, useTranslation } from '@sdppp/common';
import { SyncButton } from '@sdppp/ui-library';
import { Button, Divider, Dropdown } from 'antd';
import React from 'react';
import { isImage } from '../../utils/fileType';
import { MainStore } from '../App.store';
import ImagePreview from './ImagePreview';
import MultiImagePreview from './MultiImagePreview';

interface ImagePreviewWrapperProps {
  children?: React.ReactNode;
}

export default function ImagePreviewWrapper({ children }: ImagePreviewWrapperProps) {
  const { t } = useTranslation();
  const rawImages = MainStore(state => state.previewImageList);
  const previewMode = MainStore(state => state.previewMode);
  const selectedImages = MainStore(state => state.selectedImages);
  const setPreviewMode = MainStore(state => state.setPreviewMode);
  const toggleImageSelection = MainStore(state => state.toggleImageSelection);
  const clearImageSelection = MainStore(state => state.clearImageSelection);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const [sendingAll, setSendingAll] = React.useState(false);
  const [isShiftPressed, setIsShiftPressed] = React.useState(false);
  const [isAutoSync, setIsAutoSync] = React.useState(false);
  const [loadingFromLayer, setLoadingFromLayer] = React.useState(false);
  const isShiftPressedRef = React.useRef(false);
  const pendingAutoSendRef = React.useRef(new Map<string, { cancel: boolean }>());

  // 确保 thumbnail_url 总是有值
  const images = React.useMemo(() => 
    rawImages.map(img => ({
      ...img,
      thumbnail_url: img.thumbnail_url || img.url
    })),
    [rawImages]
  );

  const currentItem = images[currentIndex];
  const isCurrentItemImage = currentItem ? isImage(currentItem.url) : false;

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
      const type = opts?.shiftKey ? 'newdoc' : 'smartobject';
      await sdpppSDK.plugins.photoshop.importImage({
        nativePath: images[index].nativePath || images[index].url,
        // Pass boundary if available; default to 'canvas'
        boundary: images[index].boundary ?? 'canvas',
        type: type,
        // Pass through original image dimensions when known
        sourceWidth: (images as any)[index]?.width,
        sourceHeight: (images as any)[index]?.height
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendToPS = async (event?: { shiftKey?: boolean }) => {
    await sendToPSAtIndex(currentIndex, { shiftKey: !!event?.shiftKey });
  };

  // 从图层导入图片 - 使用直接调用 getImage 的方式，避免 dialog 关闭问题
  const handleImportFromLayer = async () => {
    console.log('[图层导入] 开始导入流程（直接模式）');
    
    try {
      setLoadingFromLayer(true);
      
      // 获取当前状态
      const currentList = MainStore.getState().previewImageList;
      const activeDocID = sdpppSDK.stores.PhotoshopStore.getState().activeDocumentID;
      const webviewState = sdpppSDK.stores.WebviewStore.getState() as any;
      const boundary = webviewState.workBoundaries?.[activeDocID] || 'curlayer';
      
      console.log('[图层导入] 当前状态 - activeDocID:', activeDocID, 'boundary:', boundary);
      
      // 使用固定参数直接调用 getImage，避免使用 selectLayerImage 的 dialog
      const getImageParams = {
        boundary: boundary,
        content: 'curlayer',  // 当前图层
        imageSize: 2048,  // 最大尺寸
        imageQuality: 90,  // 质量
        cropBySelection: 'no' as const,
        SkipNonNormalLayer: true
      };
      
      console.log('[图层导入] 调用 getImage，参数:', getImageParams);
      const imageResult = await sdpppSDK.plugins.photoshop.getImage(getImageParams);
      console.log('[图层导入] getImage 返回结果:', imageResult);
      
      if (imageResult.error) {
        console.error('[图层导入] getImage 返回错误:', imageResult.error);
        alert(`导入失败: ${imageResult.error}`);
        setLoadingFromLayer(false);
        return;
      }
      
      if (!imageResult.thumbnail_url && !imageResult.source && !imageResult.file_token) {
        console.warn('[图层导入] getImage 没有返回图像数据，结果:', imageResult);
        alert('未获取到图像数据，请确保当前有打开的文档和可见的图层');
        setLoadingFromLayer(false);
        return;
      }

      // 使用 file_token 作为 nativePath（如果可用），否则使用 source
      const nativePath = imageResult.file_token || imageResult.source;
      
      // 在 UXP 环境中，需要将文件路径转换为 data URL 或使用正确的协议
      // thumbnail_url 通常已经是 data:image URL 格式
      let displayUrl = imageResult.thumbnail_url || '';
      
      // 如果没有 thumbnail_url，尝试使用 source
      if (!displayUrl && imageResult.source) {
        displayUrl = imageResult.source;
      }
      
      // 如果还是没有，尝试使用 file_token 并转换为 file:// URL
      if (!displayUrl && imageResult.file_token) {
        // UXP 中的文件路径需要使用 file:// 协议
        if (!imageResult.file_token.startsWith('data:') && !imageResult.file_token.startsWith('http')) {
          displayUrl = imageResult.file_token.startsWith('file://') 
            ? imageResult.file_token 
            : `file:///${imageResult.file_token.replace(/\\/g, '/')}`;
        } else {
          displayUrl = imageResult.file_token;
        }
      }
      
      console.log('[图层导入] 图像URL处理:', {
        thumbnail_url: imageResult.thumbnail_url,
        source: imageResult.source,
        file_token: imageResult.file_token,
        finalDisplayUrl: displayUrl
      });
      
      const newImage = {
        url: displayUrl,
        thumbnail_url: displayUrl,  // 使用相同的URL确保可以显示
        nativePath: nativePath,
        source: 'layer-import',
        docId: activeDocID,
        boundary: boundary,
        width: (imageResult as any)?.width,
        height: (imageResult as any)?.height,
        downloading: false
      };
      
      console.log('[图层导入] 添加新图像到预览列表:', newImage);
      console.log('[图层导入] 当前列表长度:', currentList.length, '新列表长度:', currentList.length + 1);
      
      MainStore.setState({
        previewImageList: [...currentList, newImage]
      });
      
      console.log('[图层导入] 图像已成功添加到预览列表');
      
    } catch (error) {
      console.error('[图层导入] 导入失败，异常详情:', error);
      console.error('[图层导入] 错误堆栈:', (error as Error)?.stack);
      alert(`导入异常: ${(error as Error)?.message}`);
    } finally {
      setLoadingFromLayer(false);
      console.log('[图层导入] 导入流程结束');
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
    </>
  );
}
