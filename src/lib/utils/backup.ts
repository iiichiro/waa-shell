import type { Table } from 'dexie';
import { type AppState, useAppStore } from '../../store/useAppStore';
import {
  type CustomModel,
  db,
  type LocalFile,
  type ManualModel,
  type McpServer,
  type Message,
  type ModelConfig,
  type Provider,
  type SlashCommand,
  type Thread,
  type ThreadSettings,
} from '../db';
import { blobToDataURL, dataURLToBlob } from './image';

export interface ExportOptions {
  history: boolean;
  providers: boolean; // プロバイダー＋モデル設定
  models: boolean; // モデル設定のみ
  tools: boolean;
  mcp: boolean;
  slashCommands: boolean;
  general: boolean;
}

export interface ClearOptions {
  history: boolean;
  files: boolean;
  providers: boolean;
  models: boolean;
  tools: boolean;
  mcp: boolean;
  slashCommands: boolean;
  general: boolean;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  history?: {
    threads: Thread[];
    messages: Message[];
    files: (Omit<LocalFile, 'blob'> & { blob: string })[];
    threadSettings: ThreadSettings[];
  };
  providers?: {
    providers: Provider[];
    // 互換性のため残すが、新規エクスポート時は models 側に含める
    manualModels?: ManualModel[];
    customModels?: CustomModel[];
    modelConfigs?: ModelConfig[];
  };
  models?: {
    manualModels: ManualModel[];
    customModels: CustomModel[];
    modelConfigs: ModelConfig[];
  };
  tools?: {
    enabledTools: Record<string, boolean>;
    enabledBuiltInTools: Record<string, boolean>;
  };
  mcp?: {
    mcpServers: McpServer[];
  };
  slashCommands?: {
    slashCommands: SlashCommand[];
  };
  general?: {
    sendShortcut: 'enter' | 'ctrl-enter';
    theme: 'light' | 'dark' | 'system';
    autoGenerateTitle: boolean;
    titleGenerationProvider: string;
    titleGenerationModel: string;
  };
}

/**
 * 指定されたカテゴリのデータを収集してエクスポート用オブジェクトを作成する
 */
export async function exportData(options: ExportOptions): Promise<BackupData> {
  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
  };

  if (options.history) {
    const files = await db.files.toArray();
    const serializedFiles = await Promise.all(
      files.map(async (f) => ({
        ...f,
        blob: await blobToDataURL(f.blob),
      })),
    );

    data.history = {
      threads: await db.threads.toArray(),
      messages: await db.messages.toArray(),
      files: serializedFiles,
      threadSettings: await db.threadSettings.toArray(),
    };
  }

  if (options.providers) {
    data.providers = {
      providers: await db.providers.toArray(),
    };
  }

  if (options.models) {
    data.models = {
      manualModels: await db.manualModels.toArray(),
      customModels: await db.customModels.toArray(),
      modelConfigs: await db.modelConfigs.toArray(),
    };
  }

  if (options.mcp) {
    data.mcp = {
      mcpServers: await db.mcpServers.toArray(),
    };
  }

  if (options.slashCommands) {
    data.slashCommands = {
      slashCommands: await db.slashCommands.toArray(),
    };
  }

  const state = useAppStore.getState();

  if (options.tools) {
    data.tools = {
      enabledTools: state.enabledTools,
      enabledBuiltInTools: state.enabledBuiltInTools,
    };
  }

  if (options.general) {
    data.general = {
      sendShortcut: state.sendShortcut,
      theme: state.theme,
      autoGenerateTitle: state.autoGenerateTitle,
      titleGenerationProvider: state.titleGenerationProvider,
      titleGenerationModel: state.titleGenerationModel,
    };
  }

  return data;
}

/**
 * 文字列化したJSONをインポートし、存在する項目をDB/ストアに反映する
 */
export async function importData(jsonData: string): Promise<void> {
  const data: BackupData = JSON.parse(jsonData);

  // IDBの更新
  await db.transaction(
    'rw',
    [
      db.threads,
      db.messages,
      db.files,
      db.threadSettings,
      db.providers,
      db.manualModels,
      db.customModels,
      db.modelConfigs,
      db.mcpServers,
      db.slashCommands,
    ],
    async () => {
      if (data.history) {
        await db.threads.clear();
        await db.messages.clear();
        await db.files.clear();
        await db.threadSettings.clear();

        await db.threads.bulkAdd(
          data.history.threads.map((t) => ({
            ...t,
            createdAt: new Date(t.createdAt),
            updatedAt: new Date(t.updatedAt),
          })),
        );
        await db.messages.bulkAdd(
          data.history.messages.map((m) => ({
            ...m,
            createdAt: new Date(m.createdAt),
          })),
        );
        await db.threadSettings.bulkAdd(data.history.threadSettings);

        const files = data.history.files.map((f) => ({
          ...f,
          blob: dataURLToBlob(f.blob),
          createdAt: new Date(f.createdAt),
        }));
        await db.files.bulkAdd(files);
      }

      if (data.providers) {
        await db.providers.clear();
        await db.providers.bulkAdd(
          data.providers.providers.map((p) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          })),
        );

        // 互換性対応: 旧形式（providersの中にモデルが含まれている場合）
        if (
          data.providers.manualModels ||
          data.providers.customModels ||
          data.providers.modelConfigs
        ) {
          await db.manualModels.clear();
          await db.customModels.clear();
          await db.modelConfigs.clear();

          if (data.providers.manualModels) {
            await db.manualModels.bulkAdd(
              data.providers.manualModels.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })),
            );
          }
          if (data.providers.customModels) {
            await db.customModels.bulkAdd(
              data.providers.customModels.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })),
            );
          }
          if (data.providers.modelConfigs) {
            await db.modelConfigs.bulkAdd(data.providers.modelConfigs);
          }
        }
      }

      if (data.models) {
        // 新形式または独立したモデルインポート
        await db.manualModels.clear();
        await db.customModels.clear();
        await db.modelConfigs.clear();

        await db.manualModels.bulkAdd(
          data.models.manualModels.map((m) => ({
            ...m,
            createdAt: new Date(m.createdAt),
          })),
        );
        await db.customModels.bulkAdd(
          data.models.customModels.map((m) => ({
            ...m,
            createdAt: new Date(m.createdAt),
          })),
        );
        await db.modelConfigs.bulkAdd(data.models.modelConfigs);
      }

      if (data.mcp) {
        await db.mcpServers.clear();
        await db.mcpServers.bulkAdd(
          data.mcp.mcpServers.map((s) => ({
            ...s,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          })),
        );
      }

      if (data.slashCommands) {
        await db.slashCommands.clear();
        await db.slashCommands.bulkAdd(
          data.slashCommands.slashCommands.map((c) => ({
            ...c,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.updatedAt),
          })),
        );
      }
    },
  );

  // Zustandストアの更新
  const state = useAppStore.getState();

  if (data.tools) {
    useAppStore.setState({
      enabledTools: data.tools.enabledTools,
      enabledBuiltInTools: data.tools.enabledBuiltInTools,
    });
  }

  if (data.general) {
    state.setSendShortcut(data.general.sendShortcut);
    state.setTheme(data.general.theme);
    state.setAutoGenerateTitle(data.general.autoGenerateTitle);
    state.setTitleGenerationProvider(data.general.titleGenerationProvider);
    state.setTitleGenerationModel(data.general.titleGenerationModel);
  }
}

/**
 * 選択されたカテゴリのデータを削除する
 */
export async function clearPartialData(options: ClearOptions): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: Dexie tables are heterogeneous
  const tablesToClear: Table<any, any>[] = [];
  if (options.history) {
    tablesToClear.push(db.threads, db.messages, db.threadSettings);
  }
  if (options.files) {
    tablesToClear.push(db.files);
  }
  if (options.providers) {
    // プロバイダー削除時は、依存するモデル設定も削除する
    tablesToClear.push(db.providers, db.manualModels, db.customModels, db.modelConfigs);
  } else if (options.models) {
    // モデルのみ削除
    tablesToClear.push(db.manualModels, db.customModels, db.modelConfigs);
  }
  if (options.mcp) {
    tablesToClear.push(db.mcpServers);
  }
  if (options.slashCommands) {
    tablesToClear.push(db.slashCommands);
  }

  // IndexedDBのクリア
  if (tablesToClear.length > 0) {
    await db.transaction('rw', tablesToClear, async () => {
      await Promise.all(tablesToClear.map((table) => table.clear()));
    });
  }

  // Zustandストアのリセット
  const resetData: Partial<AppState> = {};

  if (options.tools) {
    resetData.enabledTools = {};
    resetData.enabledBuiltInTools = {};
  }

  if (options.general) {
    const { DEFAULT_SEND_SHORTCUT, DEFAULT_THEME, DEFAULT_AUTO_GENERATE_TITLE } = await import(
      '../constants/ConfigConstants'
    );

    resetData.sendShortcut = DEFAULT_SEND_SHORTCUT;
    resetData.theme = DEFAULT_THEME;
    resetData.autoGenerateTitle = DEFAULT_AUTO_GENERATE_TITLE;
    resetData.titleGenerationProvider = '';
    resetData.titleGenerationModel = '';
  }

  if (Object.keys(resetData).length > 0) {
    useAppStore.setState(resetData);
  }
}
