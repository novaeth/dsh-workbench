const element = (): null => null;

function icon(name: string): () => null {
  const component = (): null => null;
  Object.defineProperty(component, 'name', { value: name });
  return component;
}

export const Button = element;
export const TextShimmer = element;
export const CodeBlock = element;
export const Tooltip = element;
export const IconInfoOutlineRegular = icon('IconInfoOutlineRegular');
export const IconFlatListOutlineRegular = icon('IconFlatListOutlineRegular');
export const IconCodeOutlineRegular = icon('IconCodeOutlineRegular');
export const DisclosureRow = element;
export const HoverCard = element;
export const Tag = element;
export const Modal = element;
export const Switch = element;
export const StateDot = element;
export const IconCheckOutlineRegular = icon('IconCheckOutlineRegular');
export const IconChevronDownOutlineRegular = icon('IconChevronDownOutlineRegular');
export const IconEllipsisOutlineRegular = icon('IconEllipsisOutlineRegular');
export const IconFolderCloseRegular = icon('IconFolderCloseRegular');
export const IconFolderOpenRegular = icon('IconFolderOpenRegular');
export const IconNewChatOutlineRegular = icon('IconNewChatOutlineRegular');
export const IconPanelLeftOutlineRegular = icon('IconPanelLeftOutlineRegular');
export const IconPinOutlineRegular = icon('IconPinOutlineRegular');
export const IconPinFillRegular = icon('IconPinFillRegular');
export const IconPlusOutlineRegular = icon('IconPlusOutlineRegular');
export const IconRefreshOutlineRegular = icon('IconRefreshOutlineRegular');
export const IconRightUpOutlineRegular = icon('IconRightUpOutlineRegular');
export const IconSettingsOutlineRegular = icon('IconSettingsOutlineRegular');
export const IconArchiveOutlineRegular = icon('IconArchiveOutlineRegular');
export const IconCordisPluginOutlineRegular = icon('IconCordisPluginOutlineRegular');
export const IconDownloadOutlineRegular = icon('IconDownloadOutlineRegular');
export const IconFolderOpenOutlineRegular = icon('IconFolderOpenOutlineRegular');
export const IconLinkOutlineRegular = icon('IconLinkOutlineRegular');
export const IconTrashOutlineRegular = icon('IconTrashOutlineRegular');
export const useAnchoredPosition = (): null => null;
export const useDismissOnOutsidePointer = (): void => undefined;
export const writeClipboard = async (): Promise<boolean> => true;
