'use client';

import { PlusCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatSummary } from './types';

interface Props {
  chats: ChatSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ChatSidebar({
  chats,
  selectedId,
  onSelect,
  onNew,
  onDelete,
}: Props) {
  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col">
      <div className="p-3 border-b border-gray-100">
        <Button
          onClick={onNew}
          className="w-full justify-start"
          variant="default"
          size="sm"
        >
          <PlusCircle className="h-4 w-4 mr-2" />
          新建对话
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {chats.length === 0 ? (
          <p className="text-xs text-gray-400 px-2 py-4 text-center">
            还没有对话
          </p>
        ) : (
          chats.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center justify-between rounded px-2 py-1.5 text-sm cursor-pointer ${
                selectedId === c.id
                  ? 'bg-orange-50 text-orange-900'
                  : 'hover:bg-gray-50 text-gray-700'
              }`}
              onClick={() => onSelect(c.id)}
            >
              <span className="truncate flex-1">{c.title}</span>
              <button
                type="button"
                title="删除"
                className="opacity-0 group-hover:opacity-100 ml-1 text-gray-400 hover:text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('删除该对话?该对话内的所有图片将不再可见。')) {
                    onDelete(c.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
