type ChannelEntry = {
    id: string;
    label: string;
    href: string;
    index: number;
};

type MessagePayload =
    | {
          type: 'GET_CHANNELS';
      }
    | {
          type: 'SET_HIDDEN_CHANNELS';
          hiddenIds: string[];
      };

type GetChannelsResponse = {
    channels: ChannelEntry[];
    hiddenIds: string[];
};

type SetHiddenChannelsResponse = {
    ok: true;
    hiddenIds: string[];
};

const STORAGE_KEY = 'hiddenChannels';

let hiddenChannelIds = new Set<string>();
let hiddenChannelIdsPromise: Promise<void> | null = null;

const getDirectChildren = (element: Element, className: string): HTMLElement[] => {
    return Array.from(element.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains(className)
    );
};

const getChannelId = (link: HTMLAnchorElement, fallbackIndex: number): string => {
    const href = link.getAttribute('href') ?? '';
    const pathParts = href.split('/').filter(Boolean);
    return pathParts[pathParts.length - 1] ?? `channel-${fallbackIndex}`;
};

const getChannelEntries = (): ChannelEntry[] => {
    const header = document.querySelector('.com-timetable-ChannelIconHeader');

    if (!header) {
        return [];
    }

    const channelIcons = getDirectChildren(header, 'com-timetable-ChannelIcon');

    return channelIcons.map((icon, index) => {
        const link = icon.querySelector<HTMLAnchorElement>('a[href*="/timetable/channels/"]');
        const image = icon.querySelector<HTMLImageElement>('img[alt]');
        const href = link?.getAttribute('href') ?? '';
        const id = link ? getChannelId(link, index) : `channel-${index}`;

        return {
            id,
            label: image?.alt || id,
            href,
            index,
        };
    });
};

const toggleDisplay = (element: HTMLElement | null, shouldHide: boolean): void => {
    if (!element) {
        return;
    }

    if (shouldHide) {
        element.style.setProperty('display', 'none', 'important');
        return;
    }

    element.style.removeProperty('display');
};

const loadHiddenChannelIds = (): Promise<void> => {
    if (hiddenChannelIdsPromise) {
        return hiddenChannelIdsPromise;
    }

    hiddenChannelIdsPromise = new Promise<void>((resolve) => {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
            const savedChannelIds = result[STORAGE_KEY];

            hiddenChannelIds = new Set(
                Array.isArray(savedChannelIds) ? savedChannelIds.filter((value): value is string => typeof value === 'string') : []
            );
            resolve();
        });
    });

    return hiddenChannelIdsPromise;
};

const applyHiddenChannels = (): void => {
    const header = document.querySelector('.com-timetable-ChannelIconHeader');
    const timetableWrapper = document.querySelector('.com-timetable-TimeTableListTimeTable-wrapper');

    if (!header || !timetableWrapper) {
        return;
    }

    const channelIcons = getDirectChildren(header, 'com-timetable-ChannelIcon');
    const timetableColumns = getDirectChildren(timetableWrapper, 'com-timetable-TimetableColumn');

    channelIcons.forEach((icon, index) => {
        const link = icon.querySelector<HTMLAnchorElement>('a[href*="/timetable/channels/"]');
        const channelId = link ? getChannelId(link, index) : `channel-${index}`;
        const timetableColumn = timetableColumns[index] ?? null;
        const shouldHide = hiddenChannelIds.has(channelId);

        toggleDisplay(icon, shouldHide);
        toggleDisplay(timetableColumn, shouldHide);
    });
};

const serializeChannels = (): ChannelEntry[] => {
    return getChannelEntries();
};

const startObserver = (): void => {
    new MutationObserver(() => {
        void loadHiddenChannelIds().then(() => {
            applyHiddenChannels();
        });
    }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'href', 'src', 'srcset', 'alt'],
    });
};

const run = (): void => {
    void loadHiddenChannelIds().then(() => {
        applyHiddenChannels();
        startObserver();
    });
};

chrome.runtime.onMessage.addListener(
    (
        message: MessagePayload,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: GetChannelsResponse | SetHiddenChannelsResponse) => void
    ) => {
    if (message?.type === 'GET_CHANNELS') {
        void loadHiddenChannelIds().then(() => {
            sendResponse({
                channels: serializeChannels(),
                hiddenIds: Array.from(hiddenChannelIds),
            });
        });

        return true;
    }

    if (message?.type === 'SET_HIDDEN_CHANNELS') {
        const nextHiddenChannelIds = Array.isArray(message.hiddenIds)
            ? message.hiddenIds.filter((value: unknown): value is string => typeof value === 'string')
            : [];

        hiddenChannelIds = new Set(nextHiddenChannelIds);

        chrome.storage.local.set({ [STORAGE_KEY]: nextHiddenChannelIds }, () => {
            applyHiddenChannels();
            sendResponse({ ok: true, hiddenIds: Array.from(hiddenChannelIds) });
        });

        return true;
    }

    return undefined;
    }
);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
} else {
    run();
}