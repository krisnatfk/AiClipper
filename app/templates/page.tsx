'use client';

import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import TemplateCard from '@/components/templates/TemplateCard';
import TemplateEditor from '@/components/templates/TemplateEditor';
import Button from '@/components/ui/Button';
import type { RenderTemplate, CaptionStyle } from '@/types';
import { Palette, Plus, Loader2 } from 'lucide-react';

/**
 * Templates manager page (spec Section G + /templates route). Lists built-in
 * presets and user-created templates, lets the user create / edit / delete
 * user templates, and set a default. Built-in presets are read-only.
 */
export default function TemplatesPage() {
  const [templates, setTemplates] = useState<RenderTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RenderTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setError('');
      const res = await fetch('/api/templates?type=caption');
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      setTemplates(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const handleEdit = (template: RenderTemplate) => {
    setEditing(template);
    setEditorOpen(true);
  };

  const handleSave = async (data: { templateId?: string; name: string; caption_style: CaptionStyle }) => {
    const isEdit = Boolean(data.templateId);
    const res = await fetch(
      isEdit ? `/api/templates/${data.templateId}` : '/api/templates',
      {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          type: 'caption',
          caption_style: data.caption_style,
        }),
      }
    );
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error?.message || 'Failed to save template');
    }
    setEditorOpen(false);
    setEditing(null);
    await fetchTemplates();
  };

  const handleSetDefault = async (template: RenderTemplate) => {
    try {
      await fetch(`/api/templates/${template.template_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      await fetchTemplates();
    } catch {
      /* best-effort */
    }
  };

  const handleDelete = async (template: RenderTemplate) => {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    try {
      const res = await fetch(`/api/templates/${template.template_id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error?.message || 'Failed to delete');
      }
      await fetchTemplates();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const presets = templates.filter((t) => t.is_builtin);
  const userTemplates = templates.filter((t) => !t.is_builtin);

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
                <Palette className="w-6 h-6 text-accent" />
                Templates
              </h1>
              <p className="text-sm text-secondary mt-1">
                Manage caption templates. Built-in presets are read-only — duplicate one to customize.
              </p>
            </div>
            <Button variant="primary" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </div>

          {error && (
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-3 text-sm text-alert">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          ) : editorOpen ? (
            <TemplateEditor
              template={editing}
              onSave={handleSave}
              onCancel={() => {
                setEditorOpen(false);
                setEditing(null);
              }}
            />
          ) : (
            <>
              {/* Presets */}
              {presets.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-primary">Quick Presets ({presets.length})</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {presets.map((t) => (
                      <TemplateCard key={t.template_id} template={t} onSetDefault={handleSetDefault} />
                    ))}
                  </div>
                </section>
              )}

              {/* User templates */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-primary">My Templates ({userTemplates.length})</h2>
                {userTemplates.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {userTemplates.map((t) => (
                      <TemplateCard
                        key={t.template_id}
                        template={t}
                        onEdit={handleEdit}
                        onSetDefault={handleSetDefault}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="card p-8 text-center">
                    <p className="text-sm text-secondary">
                      No user templates yet. Click “New Template” to create a custom caption style.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
