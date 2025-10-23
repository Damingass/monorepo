import { DeleteOutlined, LeftOutlined, MoreOutlined, RightOutlined, SaveOutlined, SendOutlined, ShrinkOutlined, StepForwardOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
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
  const images = MainStore(state => state.previewImageList);
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
  const isShiftPressedRef = React.useRef(false);
  const pendingAutoSendRef = React.useRef(new Map<string, { cancel: boolean }>());

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

  const handleClose = () => {
    MainStore.setState({ showingPreview: false });
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
    console.log('handleImageClick called with index:', index, 'previewMode:', previewMode);
    if (previewMode === 'multi') {
      // 在多图预览模式下，点击图片只进行选择操作，不切换预览模式
      console.log('Calling toggleImageSelection for index:', index);
      toggleImageSelection(index);
    } else {
      // 在单图预览模式下，切换到指定图片
      setCurrentIndex(index);
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

  if (!images.length) {
    return null;
  }

  const actionButtons = {
    close: (
      <Button
        className="image-preview__close-btn"
        type="text"
        icon={<ShrinkOutlined />}
        onClick={handleClose}
        size="middle"
      />
    ),
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

  return (
    <>
      <div className="image-preview">
        {actionButtons.close}
        {actionButtons.modeToggle}

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
