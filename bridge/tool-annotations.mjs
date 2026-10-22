const repeatable = new Set(['close_window','clear_desk','show_message','point_at','open_quotes','open_bibliography','open_thesis','show_briefing','set_citation_style','update_source','go_to_page','go_to_slide','stash_window','write_session_summary','open_shot_log','open_checklist','arrange_windows','fill_checklist']);
const destructive = new Set(['delete_stashed','close_window','update_window','edit_thesis','remove_deadline','load_workspace','delete_workspace','save_workspace','update_source','clear_comments']);
export function annotationsFor(name, existing = {}) {
  const external = /browser_window|go_to_address|go_back|google_docs/.test(name) || name === 'use_study_tool' || name === 'what_user_is_looking_at';
  const readOnly = !!existing.readOnlyHint;
  return {
    readOnlyHint: readOnly,
    destructiveHint: readOnly ? false : (destructive.has(name) || name === 'use_study_tool' || (external && !['open_browser_window','scroll_browser_window'].includes(name))),
    idempotentHint: readOnly || repeatable.has(name),
    openWorldHint: external,
  };
}
