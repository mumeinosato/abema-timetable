type ChannelEntry = {
    id: string;
    label: string;
    href: string;
    index: number;
};

type PopupResponse = {
    channels?: ChannelEntry[];
    hiddenIds?: string[];
};

type MessageRequest =
    | {
        type: 'GET_CHANNELS';
    }
    | {
        type: 'SET_HIDDEN_CHANNELS';
        hiddenIds: string[];
    };

const statusElement = document.getElementById('status');
const channelListElement = document.getElementById('channel-list');
const refreshButton = document.getElementById('refresh-button');
const clearButton = document.getElementById('clear-button');

let activeTabId: number | null = null;
let channels: ChannelEntry[] = [];
let hiddenIds = new Set<string>();

const setStatus = (message: string): void => {
    if (statusElement) {
        statusElement.textContent = message;
    }
};

const setButtonsDisabled = (disabled: boolean): void => {
    if (refreshButton instanceof HTMLButtonElement) {
        refreshButton.disabled = disabled;
    }

    if (clearButton instanceof HTMLButtonElement) {
        clearButton.disabled = disabled;
    }
};

const getActiveTabId = async (): Promise<number | null> => {
    const [tab] = (await chrome.tabs.query({ active: true, currentWindow: true })) as chrome.tabs.Tab[];
    return typeof tab?.id === 'number' ? tab.id : null;
};

const sendMessage = <TResponse,>(tabId: number, payload: MessageRequest): Promise<TResponse> => {
    return new Promise<TResponse>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, payload, (response: TResponse) => {
            const error = chrome.runtime.lastError;

            if (error) {
                reject(new Error(error.message));
                return;
            }

            resolve(response);
        });
    });
};

const getCheckedHiddenIds = (): string[] => {
    if (!channelListElement) {
        return [];
    }

    return Array.from(channelListElement.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')).map(
        (input) => input.value
    );
};

const renderChannels = (): void => {
    if (!channelListElement) {
        return;
    }

    channelListElement.innerHTML = '';

    if (!channels.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'チャンネルが見つかりませんでした。';
        channelListElement.appendChild(empty);
        return;
    }

    channels.forEach((channel, index) => {
        const row = document.createElement('label');
        row.className = 'channel-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = channel.id;
        checkbox.checked = hiddenIds.has(channel.id);
        checkbox.addEventListener('change', () => {
            void saveHiddenIds();
        });

        const body = document.createElement('span');
        body.className = 'channel-row__body';

        const title = document.createElement('span');
        title.className = 'channel-row__title';
        title.textContent = channel.label;

        const meta = document.createElement('span');
        meta.className = 'channel-row__meta';
        meta.textContent = `${channel.id} / ${channel.href || '(no href)'} / #${index + 1}`;

        body.append(title, meta);
        row.append(checkbox, body);
        channelListElement.appendChild(row);
    });
};

const saveHiddenIds = async (): Promise<void> => {
    if (!activeTabId) {
        return;
    }

    setButtonsDisabled(true);

    try {
        const nextHiddenIds = getCheckedHiddenIds();
        hiddenIds = new Set(nextHiddenIds);
        await sendMessage<{ ok: true; hiddenIds: string[] }>(activeTabId, {
            type: 'SET_HIDDEN_CHANNELS',
            hiddenIds: nextHiddenIds,
        });
        setStatus(`${nextHiddenIds.length} 件を非表示に設定しました`);
    } catch {
        setStatus('保存に失敗しました');
    } finally {
        setButtonsDisabled(false);
    }
};

const loadChannels = async (): Promise<void> => {
    setStatus('読み込み中...');
    setButtonsDisabled(true);

    try {
        activeTabId = await getActiveTabId();

        if (!activeTabId) {
            channels = [];
            hiddenIds = new Set();
            renderChannels();
            setStatus('Abema のタブを開いてください');
            return;
        }

        const response = await sendMessage<PopupResponse>(activeTabId, { type: 'GET_CHANNELS' });
        channels = Array.isArray(response?.channels) ? response.channels : [];
        hiddenIds = new Set(Array.isArray(response?.hiddenIds) ? response.hiddenIds : []);
        renderChannels();
        setStatus(`${channels.length} 件のチャンネルを取得しました`);
    } catch {
        channels = [];
        hiddenIds = new Set();
        renderChannels();
        setStatus('Abema のページを開いてからこのアイコンを押してください');
    } finally {
        setButtonsDisabled(false);
    }
};

const clearAll = async (): Promise<void> => {
    if (!activeTabId) {
        return;
    }

    hiddenIds = new Set();
    renderChannels();
    await saveHiddenIds();
};

if (refreshButton instanceof HTMLButtonElement) {
    refreshButton.addEventListener('click', () => {
        void loadChannels();
    });
}

if (clearButton instanceof HTMLButtonElement) {
    clearButton.addEventListener('click', () => {
        void clearAll();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    void loadChannels();
});