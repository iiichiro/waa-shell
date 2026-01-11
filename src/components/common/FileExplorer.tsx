import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LayoutGrid, List, MessageSquare, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { LocalFile } from '../../lib/db';
import { deleteFile, listFiles } from '../../lib/services/FileService';
import { useAppStore } from '../../store/useAppStore';
import { CommonHeader } from '../layout/CommonHeader';

/**
 * ファイル管理画面：保存されたファイルアセットの閲覧・削除・検索
 */
export function FileExplorer() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const { setActiveThreadId, setFileExplorerOpen, isLauncher } = useAppStore();

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['files'],
    queryFn: () => listFiles(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });

  const filteredFiles = files.filter((f) =>
    f.fileName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="flex-1 flex flex-col bg-background h-full animate-in fade-in duration-300"
      data-testid="header-file-explorer"
    >
      {/* ヘッダー */}
      <CommonHeader title="ファイル管理" onClose={() => setFileExplorerOpen(false)}>
        <div className={`relative ${isLauncher ? 'w-48' : 'w-64'}`}>
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="ファイルを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border border-border">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded ${
              viewMode === 'grid'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="グリッド表示"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-1 rounded ${
              viewMode === 'list'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="リスト表示"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </CommonHeader>

      {/* ツールバー */}
      <div
        className={`${isLauncher ? 'p-2' : 'p-4'} border-b border-border bg-muted/20 flex items-center gap-4`}
      >
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="ファイルを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full bg-background border border-border pl-9 pr-4 rounded-md outline-none focus:ring-2 focus:ring-ring transition-all ${isLauncher ? 'py-1.5 text-xs' : 'py-2 text-sm'}`}
          />
        </div>
        {!isLauncher && (
          <div className="text-xs text-muted-foreground">{filteredFiles.length} 個のアイテム</div>
        )}
      </div>

      {/* コンテンツエリア */}
      <div className={`flex-1 overflow-y-auto ${isLauncher ? 'p-3' : 'p-6'}`}>
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground animate-pulse">
            読み込み中...
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-50">
            <Search className="w-12 h-12" />
            <p>ファイルが見つかりません</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div
            className={`grid gap-4 ${isLauncher ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'}`}
          >
            {filteredFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onDelete={() => file.id && deleteMutation.mutate(file.id)}
                onGoToThread={() => {
                  if (file.threadId) {
                    setActiveThreadId(file.threadId);
                    setFileExplorerOpen(false);
                  }
                }}
                formatSize={formatSize}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredFiles.map((file) => (
              <FileTableRow
                key={file.id}
                file={file}
                onDelete={() => file.id && deleteMutation.mutate(file.id)}
                formatSize={formatSize}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FileCard({
  file,
  onDelete,
  onGoToThread,
  formatSize,
}: {
  file: LocalFile;
  onDelete: () => void;
  onGoToThread: () => void;
  formatSize: (bytes: number) => string;
}) {
  const imageUrl = file.mimeType.startsWith('image/') ? URL.createObjectURL(file.blob) : null;

  return (
    <div className="group relative bg-muted/30 border border-border rounded-lg overflow-hidden hover:border-primary/30 transition-all shadow-sm">
      <div className="aspect-square bg-muted relative flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={file.fileName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="text-primary/50 font-bold uppercase text-xs">
            {file.mimeType.split('/')[1]}
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          {file.threadId && (
            <button
              type="button"
              onClick={onGoToThread}
              className="p-2 bg-background/40 hover:bg-background/60 rounded-md text-foreground backdrop-blur-md transition-all translate-y-2 group-hover:translate-y-0"
              title="スレッドへ移動"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const url = URL.createObjectURL(file.blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = file.fileName;
              a.click();
            }}
            className="p-2 bg-background/40 hover:bg-background/60 rounded-md text-foreground backdrop-blur-md transition-all translate-y-2 group-hover:translate-y-0 delay-[50ms]"
            title="ダウンロード"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-2 bg-destructive/20 hover:bg-destructive/40 rounded-md text-destructive backdrop-blur-md transition-all translate-y-2 group-hover:translate-y-0 delay-[100ms]"
            title="削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="p-3">
        <div className="text-xs font-medium text-foreground truncate">{file.fileName}</div>
        <div className="text-[10px] text-muted-foreground mt-1 flex justify-between font-mono">
          <span>{formatSize(file.size)}</span>
          <span>{new Date(file.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

function FileTableRow({
  file,
  onDelete,
  formatSize,
}: {
  file: LocalFile;
  onDelete: () => void;
  formatSize: (bytes: number) => string;
}) {
  return (
    <div className="group flex items-center gap-4 px-4 py-3 rounded-md hover:bg-muted/50 transition-all text-sm border border-transparent hover:border-border">
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <LayoutGrid className="w-4 h-4 text-primary/50" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-foreground truncate font-medium">{file.fileName}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{file.mimeType}</div>
      </div>
      <div className="hidden md:block w-24 text-muted-foreground text-right font-mono">
        {formatSize(file.size)}
      </div>
      <div className="hidden md:block w-32 text-muted-foreground text-right font-mono">
        {new Date(file.createdAt).toLocaleDateString()}
      </div>
      <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onDelete}
          className="p-2 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
