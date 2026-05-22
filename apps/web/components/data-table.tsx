'use client';

/**
 * Thin wrapper around @tanstack/react-table — provides a tiny set of
 * defaults (sorting, filtering) for admin / runs / brand-kit tables.
 *
 * Why tanstack/react-table vs raw <table>: built-in column sorting,
 * client filtering, header/cell separation, accessible markup. Per-page
 * customisation lives in the columns array each page defines, so this
 * component stays small.
 */

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

interface Props<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Optional whole-table substring filter (case-insensitive). */
  globalFilter?: string;
  emptyMessage?: string;
}

export function DataTable<T>({
  data,
  columns,
  globalFilter,
  emptyMessage = '无数据。',
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable<T>({
    data,
    columns,
    state: { sorting, globalFilter: globalFilter ?? '' },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  });

  const rows = table.getRowModel().rows;

  return (
    <table className="min-w-full text-sm">
      <thead className="text-xs text-muted-foreground border-b border-gray-200">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const sortable = header.column.getCanSort();
              const sortDir = header.column.getIsSorted();
              return (
                <th
                  key={header.id}
                  onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                  className={`text-left py-2 pr-3 ${
                    sortable ? 'cursor-pointer select-none hover:text-foreground' : ''
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sortDir === 'asc' && <ArrowUp className="h-3 w-3" />}
                    {sortDir === 'desc' && <ArrowDown className="h-3 w-3" />}
                  </span>
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={table.getAllColumns().length}
              className="py-6 text-center text-muted-foreground"
            >
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="py-2 pr-3 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
