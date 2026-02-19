import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
} from "@evenrealities/even_hub_sdk";

export const APP_LIST_CONTAINER_ID = 1;
export const APP_LIST_CONTAINER_NAME = "lamp-menu";
export const APP_HEADER_CONTAINER_ID = 2;
export const APP_TOAST_CONTAINER_ID = 3;

export async function setGlassesHeaderText(bridge: EvenAppBridge | null, text: string): Promise<void> {
  if (!bridge) return;
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: APP_HEADER_CONTAINER_ID,
      containerName: "lamp-header",
      content: text,
    })
  );
}

export async function setGlassesToastText(bridge: EvenAppBridge | null, text: string): Promise<void> {
  if (!bridge) return;
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: APP_TOAST_CONTAINER_ID,
      containerName: "lamp-toast",
      content: text,
    })
  );
}

export async function renderGlassesMenu(
  bridge: EvenAppBridge,
  statusText: string,
  items: string[],
  glassesUiCreated: boolean,
  toastTextContent: string
): Promise<boolean> {
  const list = new ListContainerProperty({
    xPosition: 20,
    yPosition: 68,
    width: 260,
    height: 190,
    containerID: APP_LIST_CONTAINER_ID,
    containerName: APP_LIST_CONTAINER_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemName: items,
    }),
  });

  const headerText = new TextContainerProperty({
    xPosition: 20,
    yPosition: 8,
    width: 260,
    height: 28,
    containerID: APP_HEADER_CONTAINER_ID,
    containerName: "lamp-header",
    isEventCapture: 0,
    content: statusText,
  });

  const toastText = new TextContainerProperty({
    xPosition: 20,
    yPosition: 36,
    width: 260,
    height: 28,
    containerID: APP_TOAST_CONTAINER_ID,
    containerName: "lamp-toast",
    isEventCapture: 0,
    content: toastTextContent,
  });

  if (!glassesUiCreated) {
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 3,
        listObject: [list],
        textObject: [headerText, toastText],
      })
    );
    if (result === StartUpPageCreateResult.success) return true;
    // If startup container is already present, host may return "invalid".
    // Rebuild is safe and keeps interaction alive after reconnect/redeploy paths.
    const rebuilt = await bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 3,
        listObject: [list],
        textObject: [headerText, toastText],
      })
    );
    return rebuilt;
  }

  await bridge.rebuildPageContainer(
    new RebuildPageContainer({
      containerTotalNum: 3,
      listObject: [list],
      textObject: [headerText, toastText],
    })
  );
  return glassesUiCreated;
}
