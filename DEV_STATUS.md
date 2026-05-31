# gantt-V2 開発状況

最終更新: 2026-05-31  
リポジトリ: https://github.com/yoshiharuikeda-sketch/gantt-V2.git  
デプロイ: Vercel (Production)

---

## 技術スタック

- **フレームワーク**: Next.js (App Router)
- **言語**: TypeScript
- **状態管理**: Zustand (`useTaskStore`)
- **DB**: Supabase
- **デプロイ**: Vercel
- **認証・権限**: RBAC (`permissions.canEdit` 等)

---

## 主要ファイル

| ファイル | 役割 |
|----------|------|
| `src/components/gantt/GanttLeftPanel.tsx` | 左パネル（タスク一覧・セル編集・右クリックメニュー等） |
| `src/components/gantt/GanttChart.tsx` | 右パネル（ガントチャート描画・行インデックス計算） |
| `src/components/gantt/GanttBar.tsx` | ガントバー・マイルストーン描画 |
| `src/components/gantt/hooks/useGanttDrag.ts` | バードラッグ（開始/終了日変更） |
| `src/hooks/useUndoRedo.ts` | Undo/Redo（フィールド編集・タスク削除） |
| `src/store/taskStore.ts` | Zustand ストア（`upsertTask`, `removeTask`） |
| `src/components/sheet/TaskSheet.tsx` | タスク詳細シート |

---

## 実装済み機能（直近セッション）

### UX・パフォーマンス改善

| コミット | 内容 |
|----------|------|
| `b1c1ed3` | EmptyRow タスク作成をオプティミスティック更新に変更（入力後即時表示） |
| `06359e0` | 空白行 Enter 後の次行選択を即時移動（APIレスポンス待ちを排除） |
| `37f5b9c` | 複数タスク一括削除をオプティミスティック更新に変更（全件即時消去） |

### 右クリック・複数選択

| コミット | 内容 |
|----------|------|
| `0538ee6` | Undo/Redo 対応（タスク削除）、右クリックメニュー位置クランプ、複数タスク一括操作 |
| `de453bf` | 「行を削除」の一括対応、右クリック時の複数選択保持 |
| `284f628` | セルドラッグ選択中に右クリックしても選択が解除されないよう修正 |
| `e788455` | `effectiveSelectedIds` 導入：selectedRowIds と selectionAnchor/Head を統合し、両方の選択方式で右クリック保持・一括削除が動作するよう修正 |

**背景**: 2 つの並存する選択システム（`selectedRowIds` / `selectionAnchor+selectionHead`）の不整合が根本原因。`effectiveSelectedIds`（useMemo）で統合。

### 開始日・終了日セル

| コミット | 内容 |
|----------|------|
| `16529cb` | 数字キー直接入力でテキスト編集モードへ移行、全角→半角自動変換、yyyymmdd/yyyy/mm/dd 正規化 |
| `9652f78` | input type を text に変更（ブラウザ固有 UI を排除）、カレンダーアイコンボタン追加 |
| `975e338` | 終了日 < 開始日 の入力を拒否（テキスト入力・カレンダーの両方）、min/max 属性でグレーアウト |

### ガントチャート

| コミット | 内容 |
|----------|------|
| `95c1109` | マイルストーン表示（start_date = end_date → アンバーダイヤモンド◆）、ドラッグ移動対応 |
| `bbba9a6` | バーとタスク行のズレ修正（buildTaskRowMap をレフトパネルの rows useMemo と一致させる） |

バードラッグ（左端=開始日変更、右端=終了日変更、中央=期間移動）は `useGanttDrag.ts` として既存実装済み。

---

## 既知の仕様・設計メモ

### 選択システムの二重構造

```
selectedRowIds (Set<string>)      ← WBS列クリック・行本体クリック
selectionAnchor / selectionHead   ← セルドラッグ
effectiveSelectedIds (useMemo)    ← 両方を統合した派生値（右クリック・一括削除に使用）
```

`handleCellMouseDown` は `setSelectedRowIds(new Set())` でリセットするため、セルドラッグ後は `selectedRowIds` が空になる。

### オプティミスティック更新パターン

```typescript
// 1. ストアに即時反映
upsertTask(tempTask) または removeTask(id)
// 2. API を非同期実行
const res = await fetch(...)
// 3. 成功: 正式データで上書き / 失敗: 元に戻す
```

### 日付正規化

```typescript
normalizeDateInput(raw: string): string
// yyyymmdd → yyyy-MM-dd
// yyyy/mm/dd → yyyy-MM-dd
// 全角数字 → 半角に変換してから処理
```

### マイルストーン判定

```typescript
const isMilestone = displayStart === displayEnd
// true → ダイヤモンド描画（#f59e0b）
// false → 通常バー描画
```

### ガントバー行インデックス

`GanttChart.tsx` の `buildTaskRowMap` がレフトパネルの `rows` useMemo と完全に一致している必要がある。  
- フェーズヘッダーはタスクの `display_order` に従って interleaved で挿入
- 未割り当てタスクにヘッダー行なし

---

## 今後の検討事項（未実装）

- タスク間の依存関係（矢印・クリティカルパス）の視覚化
- バードラッグ時のスナップ（日単位）
- 印刷・PDF エクスポート
- モバイル対応

---

## デプロイ手順

```bash
git push origin main
# → Vercel が自動デプロイ（Production）
vercel ls  # デプロイ状況確認
```
