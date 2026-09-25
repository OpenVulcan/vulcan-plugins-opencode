/**
 * VMM TUI-specific multilingual text catalog.
 * VMM TUI 专用的多语言文案目录。
 *
 * This file belongs to the TUI presentation helper layer. It keeps the setting
 * center, user manager, and TUI-only toasts on one shared translation surface
 * so terminal UI text can evolve without leaking hardcoded strings back into
 * the interaction components.
 * 这个文件属于 TUI 展示辅助层。它把设置中心、用户管理和 TUI 专属 toast
 * 的文案统一收口到同一套翻译面上，让终端界面文案可以独立演进，而不会再把
 * 硬编码字符串散回交互组件实现里。
 */

import type { VmmLanguage } from "./vmm-language.js"

/**
 * TUI text keys consumed by the setting-center screens and dialogs.
 * 设置中心界面和对话框消费的 TUI 文案键集合。
 */
export type VmmTuiTextKey =
  | "command_title"
  | "command_description"
  | "mounted_entry_label"
  | "setting_title"
  | "setting_subtitle"
  | "setting_home_filter_placeholder"
  | "setting_home_list_title"
  | "setting_home_empty"
  | "setting_home_keys_hint"
  | "setting_home_status_grpc"
  | "setting_home_status_user"
  | "setting_home_status_project"
  | "setting_home_status_language"
  | "setting_home_status_mode"
  | "setting_home_status_turns"
  | "setting_home_status_compact"
  | "setting_home_mode_visible"
  | "setting_home_mode_implicit"
  | "setting_section_functions"
  | "setting_section_details"
  | "selector_scope_title"
  | "selector_target_title"
  | "dialog_select_keys_hint"
  | "dialog_multiline_input_keys_hint"
  | "setting_keys_hint"
  | "setting_current_language"
  | "setting_menu_user_manager_title"
  | "setting_menu_user_manager_subtitle"
  | "setting_menu_user_manager_detail_1"
  | "setting_menu_user_manager_detail_2"
  | "setting_menu_user_manager_detail_3"
  | "setting_menu_user_manager_detail_4"
  | "setting_menu_project_manager_title"
  | "setting_menu_project_manager_subtitle"
  | "setting_menu_project_manager_detail_1"
  | "setting_menu_project_manager_detail_2"
  | "setting_menu_project_manager_detail_3"
  | "setting_menu_project_manager_detail_4"
  | "setting_menu_profile_center_title"
  | "setting_menu_profile_center_subtitle"
  | "setting_menu_profile_center_detail_1"
  | "setting_menu_profile_center_detail_2"
  | "setting_menu_profile_center_detail_3"
  | "setting_menu_profile_bundle_test_title"
  | "setting_menu_profile_bundle_test_subtitle"
  | "setting_menu_profile_bundle_test_detail_1"
  | "setting_menu_profile_bundle_test_detail_2"
  | "setting_menu_tools_debug_title"
  | "setting_menu_tools_debug_subtitle"
  | "setting_menu_tools_debug_detail_1"
  | "setting_menu_tools_debug_detail_2"
  | "setting_menu_tools_debug_detail_3"
  | "setting_menu_language_title"
  | "setting_menu_language_subtitle"
  | "setting_menu_language_detail_1"
  | "setting_menu_language_detail_2"
  | "setting_menu_language_detail_3"
  | "setting_menu_memory_title"
  | "setting_menu_memory_subtitle"
  | "setting_menu_memory_detail_1"
  | "setting_menu_memory_detail_2"
  | "setting_menu_memory_detail_3"
  | "setting_menu_grpc_transport_title"
  | "setting_menu_grpc_transport_subtitle"
  | "setting_menu_grpc_transport_detail_1"
  | "setting_menu_grpc_transport_detail_2"
  | "setting_menu_grpc_transport_detail_3"
  | "user_manager_title"
  | "user_manager_subtitle"
  | "user_manager_section_list"
  | "user_manager_section_actions"
  | "user_manager_section_users"
  | "user_manager_details_fallback"
  | "user_manager_status"
  | "user_manager_current_user"
  | "user_manager_current_scope_user"
  | "user_manager_unset"
  | "user_manager_bind_scope"
  | "user_manager_loading"
  | "user_manager_missing_grpc"
  | "user_manager_loaded_users"
  | "user_manager_item_current_subtitle"
  | "user_manager_item_scope_current_subtitle"
  | "user_manager_item_bind_subtitle"
  | "user_manager_status_bound_local"
  | "user_manager_status_resolving"
  | "user_manager_status_created"
  | "user_manager_status_resolved"
  | "user_manager_status_switched"
  | "user_manager_no_selectable"
  | "user_manager_selected_user"
  | "user_manager_selected_user_id"
  | "user_manager_already_bound"
  | "user_manager_already_bound_in_scope"
  | "user_manager_press_bind"
  | "user_manager_scope_note"
  | "user_manager_toast_title"
  | "user_manager_toast_switched"
  | "user_manager_keys_hint"
  | "user_manager_clear_title"
  | "user_manager_clear_subtitle"
  | "user_manager_clear_detail_1"
  | "user_manager_clear_detail_2"
  | "user_manager_status_cleared"
  | "user_manager_new_user_title"
  | "user_manager_new_user_subtitle"
  | "user_manager_new_user_detail_1"
  | "user_manager_new_user_detail_2"
  | "user_manager_new_user_detail_3"
  | "user_manager_refresh_title"
  | "user_manager_refresh_subtitle"
  | "user_manager_refresh_detail_1"
  | "user_manager_refresh_detail_2"
  | "user_manager_overlay_filter_placeholder"
  | "user_manager_overlay_list_title"
  | "user_manager_overlay_loading"
  | "user_manager_overlay_empty"
  | "user_manager_overlay_keys_hint"
  | "user_manager_overlay_group_actions"
  | "user_manager_overlay_group_users"
  | "user_manager_overlay_add_title"
  | "user_manager_overlay_add_subtitle"
  | "user_manager_overlay_clear_workspace_title"
  | "user_manager_overlay_clear_workspace_subtitle"
  | "user_manager_overlay_workspace_summary"
  | "user_manager_overlay_global_summary"
  | "user_manager_overlay_inherit_global"
  | "user_manager_overlay_scope_dialog_title"
  | "user_manager_overlay_scope_workspace_title"
  | "user_manager_overlay_scope_workspace_subtitle"
  | "user_manager_overlay_scope_global_title"
  | "user_manager_overlay_scope_global_subtitle"
  | "user_manager_overlay_scope_delete_title"
  | "user_manager_overlay_scope_delete_subtitle"
  | "user_manager_overlay_replace_global_title"
  | "user_manager_overlay_account_label"
  | "user_manager_overlay_id_label"
  | "user_manager_overlay_toast_title"
  | "user_manager_overlay_status_loaded"
  | "user_manager_overlay_status_bound"
  | "user_manager_overlay_status_cleared"
  | "user_manager_overlay_status_deleted"
  | "user_manager_overlay_delete_prompt_title"
  | "user_manager_overlay_delete_prompt_placeholder"
  | "user_manager_overlay_delete_prompt_warning"
  | "user_manager_overlay_delete_prompt_expected"
  | "user_manager_overlay_delete_prompt_retry"
  | "user_manager_overlay_delete_prompt_empty"
  | "user_manager_overlay_delete_prompt_mismatch"
  | "user_manager_overlay_delete_effect_workspace_inherit"
  | "user_manager_overlay_delete_effect_global_replace"
  | "user_manager_overlay_delete_missing_global_replacement"
  | "project_manager_overlay_filter_placeholder"
  | "project_manager_overlay_list_title"
  | "project_manager_overlay_loading"
  | "project_manager_overlay_empty"
  | "project_manager_overlay_keys_hint"
  | "project_manager_overlay_group_actions"
  | "project_manager_overlay_group_projects"
  | "project_manager_overlay_add_title"
  | "project_manager_overlay_add_subtitle"
  | "project_manager_overlay_clear_workspace_title"
  | "project_manager_overlay_clear_workspace_subtitle"
  | "project_manager_overlay_workspace_summary"
  | "project_manager_overlay_global_summary"
  | "project_manager_overlay_inherit_global"
  | "project_manager_overlay_scope_dialog_title"
  | "project_manager_overlay_scope_workspace_title"
  | "project_manager_overlay_scope_workspace_subtitle"
  | "project_manager_overlay_scope_global_title"
  | "project_manager_overlay_scope_global_subtitle"
  | "project_manager_overlay_scope_delete_title"
  | "project_manager_overlay_scope_delete_subtitle"
  | "project_manager_overlay_scope_migrate_title"
  | "project_manager_overlay_scope_migrate_subtitle"
  | "project_manager_overlay_replace_global_title"
  | "project_manager_overlay_id_label"
  | "project_manager_overlay_toast_title"
  | "project_manager_overlay_status_loaded"
  | "project_manager_overlay_status_bound"
  | "project_manager_overlay_status_cleared"
  | "project_manager_overlay_status_created"
  | "project_manager_overlay_status_resolved"
  | "project_manager_overlay_status_deleted"
  | "project_manager_overlay_status_migrated"
  | "project_manager_overlay_delete_running"
  | "project_manager_overlay_migrate_running"
  | "project_manager_overlay_delete_prompt_title"
  | "project_manager_overlay_delete_prompt_placeholder"
  | "project_manager_overlay_delete_prompt_warning"
  | "project_manager_overlay_delete_prompt_expected"
  | "project_manager_overlay_delete_prompt_retry"
  | "project_manager_overlay_delete_prompt_empty"
  | "project_manager_overlay_delete_prompt_mismatch"
  | "project_manager_overlay_delete_effect_workspace_inherit"
  | "project_manager_overlay_delete_effect_global_replace"
  | "project_manager_overlay_delete_missing_global_replacement"
  | "project_manager_overlay_delete_backend_confirm_title"
  | "project_manager_overlay_delete_backend_confirm_message"
  | "project_manager_overlay_migrate_prompt_title"
  | "project_manager_overlay_migrate_prompt_placeholder"
  | "project_manager_overlay_migrate_prompt_description"
  | "project_manager_overlay_migrate_prompt_empty"
  | "project_manager_overlay_migrate_confirm_input_title"
  | "project_manager_overlay_migrate_confirm_input_placeholder"
  | "project_manager_overlay_migrate_confirm_input_warning"
  | "project_manager_overlay_migrate_confirm_input_expected"
  | "project_manager_overlay_migrate_confirm_input_retry"
  | "project_manager_overlay_migrate_confirm_input_empty"
  | "project_manager_overlay_migrate_confirm_input_mismatch"
  | "project_manager_overlay_migrate_backend_confirm_title"
  | "project_manager_overlay_migrate_backend_confirm_message"
  | "project_manager_overlay_migrate_effect_workspace_switch"
  | "project_manager_overlay_migrate_effect_global_switch"
  | "project_manager_overlay_invalid_path"
  | "project_manager_overlay_error_invalid_path"
  | "project_manager_overlay_error_exists"
  | "project_manager_overlay_error_conflict"
  | "project_manager_overlay_error_confirmation"
  | "project_manager_title"
  | "project_manager_subtitle"
  | "project_manager_section_list"
  | "project_manager_section_actions"
  | "project_manager_section_projects"
  | "project_manager_details_fallback"
  | "project_manager_status"
  | "project_manager_current_project"
  | "project_manager_current_scope_project"
  | "project_manager_loading"
  | "project_manager_missing_grpc"
  | "project_manager_loaded_projects"
  | "project_manager_item_current_subtitle"
  | "project_manager_item_scope_current_subtitle"
  | "project_manager_item_bind_subtitle"
  | "project_manager_already_bound_in_scope"
  | "project_manager_status_bound"
  | "project_manager_status_ensuring"
  | "project_manager_status_created"
  | "project_manager_status_resolved"
  | "project_manager_status_cleared"
  | "project_manager_toast_title"
  | "project_manager_toast_switched"
  | "project_manager_keys_hint"
  | "project_manager_new_title"
  | "project_manager_new_subtitle"
  | "project_manager_new_detail_1"
  | "project_manager_new_detail_2"
  | "project_manager_new_detail_3"
  | "project_manager_new_prompt_title"
  | "project_manager_new_prompt_placeholder"
  | "project_manager_new_prompt_description"
  | "project_manager_new_prompt_empty"
  | "project_manager_refresh_title"
  | "project_manager_refresh_subtitle"
  | "project_manager_refresh_detail_1"
  | "project_manager_refresh_detail_2"
  | "project_manager_clear_title"
  | "project_manager_clear_subtitle"
  | "project_manager_clear_detail_1"
  | "project_manager_clear_detail_2"
  | "language_control_title"
  | "language_control_subtitle"
  | "language_control_section_list"
  | "language_control_details_fallback"
  | "language_control_current_effective"
  | "language_control_write_scope"
  | "language_control_status"
  | "language_control_toast_title"
  | "language_control_saved"
  | "language_control_cleared"
  | "language_control_keys_hint"
  | "language_control_list_title"
  | "language_control_loading"
  | "language_control_group_actions"
  | "language_control_group_languages"
  | "language_control_workspace_summary"
  | "language_control_global_summary"
  | "language_control_effective_summary"
  | "language_control_inherit_global_value"
  | "language_control_status_loaded"
  | "language_control_scope_dialog_title"
  | "language_control_scope_workspace_title"
  | "language_control_scope_workspace_subtitle"
  | "language_control_scope_global_title"
  | "language_control_scope_global_subtitle"
  | "language_control_clear_title"
  | "language_control_clear_subtitle"
  | "language_control_clear_detail_1"
  | "language_control_clear_detail_2"
  | "memory_settings_title"
  | "memory_settings_subtitle"
  | "memory_settings_section_list"
  | "memory_settings_loading"
  | "memory_settings_scope_dialog_title"
  | "memory_settings_scope_workspace_title"
  | "memory_settings_scope_workspace_subtitle"
  | "memory_settings_scope_global_title"
  | "memory_settings_scope_global_subtitle"
  | "memory_settings_toast_title"
  | "memory_settings_keys_hint"
  | "memory_settings_inherit_value"
  | "memory_settings_state_pair"
  | "memory_settings_session_compact_enabled_value"
  | "memory_settings_session_compact_disabled_value"
  | "memory_settings_mode_adjust_title"
  | "memory_settings_mode_adjust_subtitle"
  | "memory_settings_mode_select_title"
  | "memory_settings_mode_visible_title"
  | "memory_settings_mode_visible_subtitle"
  | "memory_settings_mode_visible_detail_1"
  | "memory_settings_mode_visible_detail_2"
  | "memory_settings_mode_implicit_title"
  | "memory_settings_mode_implicit_subtitle"
  | "memory_settings_mode_implicit_detail_1"
  | "memory_settings_mode_implicit_detail_2"
  | "memory_settings_turns_title"
  | "memory_settings_turns_subtitle"
  | "memory_settings_turns_detail_1"
  | "memory_settings_turns_detail_2"
  | "memory_settings_turns_prompt_title"
  | "memory_settings_turns_prompt_placeholder"
  | "memory_settings_turns_prompt_description"
  | "memory_settings_turns_prompt_empty"
  | "memory_settings_turns_prompt_invalid"
  | "memory_settings_profile_refresh_title"
  | "memory_settings_profile_refresh_subtitle"
  | "memory_settings_profile_refresh_detail_1"
  | "memory_settings_profile_refresh_detail_2"
  | "memory_settings_profile_refresh_prompt_title"
  | "memory_settings_profile_refresh_prompt_placeholder"
  | "memory_settings_profile_refresh_prompt_description"
  | "memory_settings_profile_refresh_prompt_empty"
  | "memory_settings_profile_refresh_prompt_invalid"
  | "memory_settings_session_compact_adjust_title"
  | "memory_settings_session_compact_adjust_subtitle"
  | "memory_settings_session_compact_select_title"
  | "memory_settings_session_compact_on_title"
  | "memory_settings_session_compact_on_subtitle"
  | "memory_settings_session_compact_on_detail_1"
  | "memory_settings_session_compact_on_detail_2"
  | "memory_settings_session_compact_off_title"
  | "memory_settings_session_compact_off_subtitle"
  | "memory_settings_session_compact_off_detail_1"
  | "memory_settings_session_compact_off_detail_2"
  | "memory_settings_saved_visible"
  | "memory_settings_saved_implicit"
  | "memory_settings_saved_turns"
  | "memory_settings_saved_profile_refresh"
  | "memory_settings_saved_session_compact_on"
  | "memory_settings_saved_session_compact_off"
  | "grpc_transport_section_list"
  | "grpc_transport_loading"
  | "grpc_transport_scope_dialog_title"
  | "grpc_transport_scope_workspace_subtitle"
  | "grpc_transport_scope_global_subtitle"
  | "grpc_transport_toast_title"
  | "grpc_transport_vulcan_host_target_title"
  | "grpc_transport_vulcan_host_target_subtitle"
  | "grpc_transport_endpoint_plan_summary"
  | "grpc_transport_endpoint_prompt_placeholder"
  | "grpc_transport_endpoint_prompt_description"
  | "grpc_transport_endpoint_prompt_invalid"
  | "grpc_transport_vulcan_host_target_prompt_title"
  | "grpc_transport_saved_vulcan_host_target"
  | "grpc_transport_keepalive_time_title"
  | "grpc_transport_keepalive_time_subtitle"
  | "grpc_transport_keepalive_timeout_title"
  | "grpc_transport_keepalive_timeout_subtitle"
  | "grpc_transport_permit_title"
  | "grpc_transport_permit_subtitle"
  | "grpc_transport_save_failed"
  | "grpc_transport_keepalive_time_prompt_title"
  | "grpc_transport_keepalive_time_prompt_placeholder"
  | "grpc_transport_keepalive_time_prompt_description"
  | "grpc_transport_keepalive_time_prompt_empty"
  | "grpc_transport_keepalive_time_prompt_invalid"
  | "grpc_transport_keepalive_timeout_prompt_title"
  | "grpc_transport_keepalive_timeout_prompt_placeholder"
  | "grpc_transport_keepalive_timeout_prompt_description"
  | "grpc_transport_keepalive_timeout_prompt_empty"
  | "grpc_transport_keepalive_timeout_prompt_invalid"
  | "grpc_transport_keepalive_timeout_exceeds_time"
  | "grpc_transport_keepalive_time_below_timeout"
  | "grpc_transport_permit_select_title"
  | "grpc_transport_permit_disabled_title"
  | "grpc_transport_permit_disabled_subtitle"
  | "grpc_transport_permit_enabled_title"
  | "grpc_transport_permit_enabled_subtitle"
  | "grpc_transport_saved_keepalive_time"
  | "grpc_transport_saved_keepalive_timeout"
  | "grpc_transport_saved_permit_on"
  | "grpc_transport_saved_permit_off"
  | "profile_center_title"
  | "profile_center_subtitle"
  | "profile_center_section_list"
  | "profile_center_section_targets"
  | "profile_center_section_actions"
  | "profile_center_section_nodes"
  | "profile_center_details_fallback"
  | "profile_center_current_target"
  | "profile_center_status"
  | "profile_target_selected_subtitle"
  | "profile_target_switch_subtitle"
  | "profile_center_loading"
  | "profile_center_no_binding_user"
  | "profile_center_no_binding_project"
  | "profile_center_no_nodes"
  | "profile_center_loaded_nodes"
  | "profile_center_applying"
  | "profile_center_toast_title"
  | "profile_center_keys_hint"
  | "profile_center_refresh_title"
  | "profile_center_refresh_subtitle"
  | "profile_center_refresh_detail_1"
  | "profile_center_refresh_detail_2"
  | "profile_center_add_title"
  | "profile_center_add_subtitle"
  | "profile_center_add_detail_1"
  | "profile_center_add_detail_2"
  | "profile_center_add_detail_3"
  | "profile_center_add_prompt_title"
  | "profile_center_add_prompt_placeholder"
  | "profile_center_add_prompt_description"
  | "profile_center_add_prompt_empty"
  | "profile_center_confirm_title"
  | "profile_center_confirm_message"
  | "profile_center_applied"
  | "profile_center_launcher_title"
  | "profile_center_launcher_subtitle"
  | "profile_center_launcher_hint"
  | "profile_center_launcher_status_idle"
  | "profile_center_workspace_header"
  | "profile_center_workspace_hint"
  | "profile_center_filter_placeholder"
  | "profile_center_details_title"
  | "profile_center_details_hint"
  | "profile_bundle_test_title"
  | "profile_bundle_test_section_actions"
  | "profile_bundle_test_section_bundle"
  | "profile_bundle_test_refresh_title"
  | "profile_bundle_test_refresh_subtitle"
  | "profile_bundle_test_loading"
  | "profile_bundle_test_missing_scope"
  | "profile_bundle_test_status_idle"
  | "profile_bundle_test_status_loaded"
  | "profile_bundle_test_empty"
  | "profile_bundle_test_keys_hint"
  | "tools_debug_title"
  | "tools_debug_section_actions"
  | "tools_debug_section_request"
  | "tools_debug_section_response"
  | "tools_debug_status_idle"
  | "tools_debug_loading"
  | "tools_debug_missing_grpc"
  | "tools_debug_missing_scope"
  | "tools_debug_request_empty"
  | "tools_debug_response_empty"
  | "tools_debug_keys_hint"
  | "tools_debug_action_healthz_title"
  | "tools_debug_action_healthz_subtitle"
  | "tools_debug_action_search_memory_title"
  | "tools_debug_action_search_memory_subtitle"
  | "tools_debug_action_turn_details_title"
  | "tools_debug_action_turn_details_subtitle"
  | "tools_debug_action_write_memories_title"
  | "tools_debug_action_write_memories_subtitle"
  | "tools_debug_search_prompt_title"
  | "tools_debug_search_prompt_placeholder"
  | "tools_debug_search_prompt_description"
  | "tools_debug_search_prompt_empty"
  | "tools_debug_search_prompt_invalid"
  | "tools_debug_search_topk_prompt_title"
  | "tools_debug_search_topk_prompt_placeholder"
  | "tools_debug_search_topk_prompt_description"
  | "tools_debug_search_topk_prompt_empty"
  | "tools_debug_search_topk_prompt_invalid"
  | "tools_debug_turn_prompt_title"
  | "tools_debug_turn_prompt_placeholder"
  | "tools_debug_turn_prompt_description"
  | "tools_debug_turn_prompt_empty"
  | "tools_debug_turn_prompt_invalid"
  | "tools_debug_write_prompt_title"
  | "tools_debug_write_prompt_placeholder"
  | "tools_debug_write_prompt_description"
  | "tools_debug_write_prompt_empty"
  | "tools_debug_write_prompt_invalid"
  | "tools_debug_write_abstract_prompt_title"
  | "tools_debug_write_abstract_prompt_placeholder"
  | "tools_debug_write_abstract_prompt_description"
  | "tools_debug_write_details_prompt_title"
  | "tools_debug_write_details_prompt_placeholder"
  | "tools_debug_write_details_prompt_description"
  | "tools_debug_write_scope_prompt_title"
  | "tools_debug_write_scope_prompt_description"
  | "tools_debug_write_scope_session_title"
  | "tools_debug_write_scope_session_subtitle"
  | "tools_debug_write_scope_project_title"
  | "tools_debug_write_scope_project_subtitle"
  | "tools_debug_write_scope_user_title"
  | "tools_debug_write_scope_user_subtitle"
  | "tools_debug_write_priority_prompt_title"
  | "tools_debug_write_priority_prompt_description"
  | "tools_debug_write_priority_p0_title"
  | "tools_debug_write_priority_p0_subtitle"
  | "tools_debug_write_priority_p1_title"
  | "tools_debug_write_priority_p1_subtitle"
  | "tools_debug_write_priority_p2_title"
  | "tools_debug_write_priority_p2_subtitle"
  | "tools_debug_write_level_prompt_title"
  | "tools_debug_write_level_prompt_description"
  | "tools_debug_write_level_l0_title"
  | "tools_debug_write_level_l0_subtitle"
  | "tools_debug_write_level_l1_title"
  | "tools_debug_write_level_l1_subtitle"
  | "tools_debug_write_level_l2_title"
  | "tools_debug_write_level_l2_subtitle"
  | "tools_debug_write_level_l3_title"
  | "tools_debug_write_level_l3_subtitle"
  | "tools_debug_write_category_prompt_title"
  | "tools_debug_write_category_prompt_placeholder"
  | "tools_debug_write_category_prompt_description"
  | "tools_debug_write_category_prompt_invalid"
  | "profile_workspace_action_add_subtitle"
  | "profile_workspace_action_refresh_subtitle"
  | "profile_target_user_launcher"
  | "profile_target_project_launcher"
  | "profile_target_space_launcher"
  | "profile_target_team_launcher"
  | "profile_detail_field_key"
  | "profile_detail_field_value"
  | "profile_detail_field_node_id"
  | "profile_detail_field_target"
  | "profile_detail_field_bind_id"
  | "profile_detail_field_plw"
  | "profile_detail_field_priority"
  | "profile_detail_field_level"
  | "profile_detail_field_refresh_weight"
  | "profile_detail_field_profile_date"
  | "profile_detail_field_expires"
  | "profile_detail_field_source"
  | "profile_detail_field_source_id"
  | "profile_detail_field_content"
  | "profile_detail_field_reason"
  | "profile_target_user"
  | "profile_target_project"
  | "profile_target_team"
  | "profile_target_space"
  | "profile_node_scope"
  | "profile_node_source"
  | "profile_node_expires"
  | "profile_node_reason"
  | "profile_node_plw"
  | "profile_table_id"
  | "profile_table_scope"
  | "profile_table_plw"
  | "profile_table_profile_date"
  | "profile_table_expires"
  | "profile_table_source"
  | "profile_table_content"
  | "profile_center_details_meta_title"
  | "profile_center_details_story_title"
  | "scope_local_title"
  | "scope_global_title"
  | "scope_selected_subtitle"
  | "scope_switch_subtitle"
  | "scope_detail_selected"
  | "scope_detail_switch"
  | "back_setting_title"
  | "back_setting_subtitle"
  | "back_setting_detail_1"
  | "back_setting_detail_2"
  | "new_user_dialog_title"
  | "new_user_dialog_placeholder"
  | "new_user_dialog_description"
  | "new_user_dialog_empty"
  | "summary_ok"
  | "summary_handshake_timeout"
  | "summary_receive_timeout"
  | "summary_failed"

/**
 * One language catalog for the VMM TUI surface.
 * 一套 VMM TUI 界面的单语言文案目录。
 */
type VmmTuiCatalog = Record<VmmTuiTextKey, string>

/**
 * Fill one TUI template string with runtime placeholders.
 * 使用运行时占位变量填充一条 TUI 模板字符串。
 */
function formatTemplate(template: string, vars: Record<string, string | number> = {}) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key) => String(vars[key] ?? ""))
}

/**
 * English baseline used both as the default catalog and fallback surface.
 * 英语基线目录，同时用作默认文案和回退文案面。
 */
const VMM_TUI_CATALOG_EN: VmmTuiCatalog = {
  command_title: "Vulcan Control Panel",
  command_description: "Open the Vulcan control panel",
  mounted_entry_label: "Vulcan Control Panel",
  setting_title: "Vulcan Control Panel",
  setting_subtitle:
    "Configure Vulcan from a dedicated TUI window instead of generating assistant replies.",
  setting_home_filter_placeholder: "Filter commands by title...",
  setting_home_list_title: "Commands",
  setting_home_empty: "No commands matched the current filter.",
  setting_home_keys_hint:
    "Type to filter | ↑↓/j/k navigate | Enter open | Esc clear/return",
  setting_home_status_grpc: "gRPC",
  setting_home_status_user: "CurrentUser",
  setting_home_status_project: "CurrentProject",
  setting_home_status_language: "Language",
  setting_home_status_mode: "Mode",
  setting_home_status_turns: "Turns",
  setting_home_status_compact: "Compact",
  setting_home_mode_visible: "Visible",
  setting_home_mode_implicit: "Implicit",
  setting_section_functions: "Functions",
  setting_section_details: "Details",
  selector_scope_title: "Write Scope",
  selector_target_title: "Profile Targets",
  dialog_select_keys_hint: "↑↓ select | Enter confirm | Esc/right-click cancel",
  dialog_multiline_input_keys_hint:
    "Enter newline | Ctrl+Enter confirm | Tab switch buttons",
  setting_keys_hint: "Keys: Up/Down to select, Enter to open, Esc to leave.",
  setting_current_language: "Current UI language: {language}",
  setting_menu_user_manager_title: "User Manager",
  setting_menu_user_manager_subtitle: "List, create, and switch Vulcan users.",
  setting_menu_user_manager_detail_1: "Open a dedicated user control window.",
  setting_menu_user_manager_detail_2: "That window fetches the live user list from VMM.",
  setting_menu_user_manager_detail_3:
    "You can switch directly to an existing user, or create a new one by name.",
  setting_menu_user_manager_detail_4:
    "Use the right-side selector panel to switch between local and global write scope.",
  setting_menu_project_manager_title: "Project Manager",
  setting_menu_project_manager_subtitle: "List, create, and switch Vulcan projects.",
  setting_menu_project_manager_detail_1: "Open a dedicated project control window.",
  setting_menu_project_manager_detail_2: "That window fetches the live project list from VMM.",
  setting_menu_project_manager_detail_3:
    "You can bind an existing project or create a canonical Team/Space/Project path.",
  setting_menu_project_manager_detail_4:
    "The project manager supports both local and global write scopes.",
  setting_menu_profile_center_title: "Profile Center",
  setting_menu_profile_center_subtitle: "Inspect and edit active Vulcan profile nodes.",
  setting_menu_profile_center_detail_1:
    "Switch between user, project, team, and space profile targets.",
  setting_menu_profile_center_detail_2:
    "Refresh active nodes or add one manual profile instruction from the same window.",
  setting_menu_profile_center_detail_3:
    "Profile reads request the backend maximum slice so review stays as complete as possible.",
  setting_menu_profile_bundle_test_title: "Profile Bundle Test",
  setting_menu_profile_bundle_test_subtitle:
    "Fetch one disposable FULL profile bundle for the current bindings.",
  setting_menu_profile_bundle_test_detail_1:
    "Open one isolated test page for the new GetProfileBundle RPC.",
  setting_menu_profile_bundle_test_detail_2:
    "This page always requests FULL mode through the Node bridge and renders the raw returned text.",
  setting_menu_tools_debug_title: "Tools Debug",
  setting_menu_tools_debug_subtitle:
    "Probe memory tool-related Vulcan gRPC interfaces with the current workspace bindings.",
  setting_menu_tools_debug_detail_1:
    "Open one isolated debug page for durable-memory RPCs exposed to tools.",
  setting_menu_tools_debug_detail_2:
    "The page reuses the current vulcan_host_target and, when needed, the current user/project bindings plus the current session route context.",
  setting_menu_tools_debug_detail_3:
    "Use it to inspect raw request and response payloads without leaving /vulcan-setting.",
  setting_menu_language_title: "Language Control",
  setting_menu_language_subtitle: "Set local or global Vulcan UI language overrides.",
  setting_menu_language_detail_1:
    "Choose one supported language or clear the current scoped override.",
  setting_menu_language_detail_2:
    "The effective language updates immediately for this TUI window.",
  setting_menu_language_detail_3:
    "Command-palette descriptions still require an OpenCode restart to refresh.",
  setting_menu_memory_title: "Memory Settings",
  setting_menu_memory_subtitle:
    "Configure visible/implicit mode, implicit turns, profile refresh turns, and compact-aware recall.",
  setting_menu_memory_detail_1:
    "Switch between visible memory injection and implicit memory injection.",
  setting_menu_memory_detail_2:
    "Adjust implicit_memory_turns, profile_refresh_turns, and compact-aware recall from the same window.",
  setting_menu_memory_detail_3:
    "Both local and global write scopes are available here.",
  setting_menu_grpc_transport_title: "gRPC Transport",
  setting_menu_grpc_transport_subtitle:
    "Configure vulcan-host connectivity and keepalive behavior.",
  setting_menu_grpc_transport_detail_1:
    "Edit vulcan_host_target as the only plugin-side gRPC endpoint.",
  setting_menu_grpc_transport_detail_2:
    "VMM and LuaSkills routing are handled behind vulcan-host.",
  setting_menu_grpc_transport_detail_3:
    "Adjust keepalive time, timeout, and idle ping behavior from the same page.",
  user_manager_title: "Vulcan User Manager",
  user_manager_subtitle: "Live Vulcan users on the left. Details and action hint on the right.",
  user_manager_section_list: "User List",
  user_manager_section_actions: "Actions",
  user_manager_section_users: "Live Users",
  user_manager_details_fallback: "Details",
  user_manager_status: "Status",
  user_manager_current_user: "Current effective user_id: {value}",
  user_manager_current_scope_user: "Current {scope} user_id: {value}",
  user_manager_unset: "(unset)",
  user_manager_bind_scope: "Current write scope: {scope}",
  user_manager_loading: "Loading user list...",
  user_manager_missing_grpc: "vulcan_host_target is not configured yet.",
  user_manager_loaded_users: "Loaded {count} users.",
  user_manager_item_current_subtitle: "#{id} · current effective user",
  user_manager_item_scope_current_subtitle: "#{id} · current {scope} binding",
  user_manager_item_bind_subtitle: "#{id} · bind in {scope}",
  user_manager_status_bound_local: "Bound {scope} user_id to {name} (#{id}).",
  user_manager_status_resolving: "Resolving user \"{name}\"...",
  user_manager_status_created: "User created: {name} (#{id}).",
  user_manager_status_resolved: "User resolved: {name} (#{id}).",
  user_manager_status_switched: "{scope} user switched to {name} (#{id}).",
  user_manager_no_selectable: "No user-manager item is currently selectable.",
  user_manager_selected_user: "Selected user: {name}",
  user_manager_selected_user_id: "User ID: {id}",
  user_manager_already_bound: "This user is already the current effective binding.",
  user_manager_already_bound_in_scope: "This user is already bound in the selected scope ({scope}).",
  user_manager_press_bind: "Press Enter or click to bind this user into {scope}.",
  user_manager_scope_note: "The selected write scope is currently {scope}.",
  user_manager_toast_title: "Vulcan User Manager",
  user_manager_toast_switched: "{scope} user switched to {name} (#{id}).",
  user_manager_keys_hint: "Keys: Up/Down to select, Enter to act, Esc to go back.",
  user_manager_clear_title: "Clear Bound User",
  user_manager_clear_subtitle: "Clear the selected scope user binding.",
  user_manager_clear_detail_1: "Remove the current user_id override from the selected write scope.",
  user_manager_clear_detail_2:
    "The effective user may still come from the other scope after clearing.",
  user_manager_status_cleared: "{scope} user binding has been cleared.",
  user_manager_new_user_title: "New User",
  user_manager_new_user_subtitle: "Resolve or create a user by name.",
  user_manager_new_user_detail_1: "Open a prompt to enter a user name.",
  user_manager_new_user_detail_2:
    "The manager will call ResolveUser with confirm_create=true.",
  user_manager_new_user_detail_3:
    "If the user does not exist, VMM will create it and then bind it into the selected scope.",
  user_manager_refresh_title: "Refresh User List",
  user_manager_refresh_subtitle: "Reload live data from VMM.",
  user_manager_refresh_detail_1: "Reload the live user list from VMM.",
  user_manager_refresh_detail_2:
    "Use this after creating users elsewhere, or after a backend restart.",
  user_manager_overlay_filter_placeholder: "Filter user accounts...",
  user_manager_overlay_list_title: "User Manager",
  user_manager_overlay_loading: "Loading user list...",
  user_manager_overlay_empty: "No user matches the current filter.",
  user_manager_overlay_keys_hint:
    "Type to filter | ↑↓/j/k navigate | Enter open | Esc/right click return",
  user_manager_overlay_group_actions: "Functions",
  user_manager_overlay_group_users: "User List",
  user_manager_overlay_add_title: "Add User",
  user_manager_overlay_add_subtitle: "Create one user for personal profile binding.",
  user_manager_overlay_clear_workspace_title: "Clear Workspace Setting",
  user_manager_overlay_clear_workspace_subtitle:
    "Remove the workspace override so the shared public user binding is used again.",
  user_manager_overlay_workspace_summary: "WorkspaceUser: {value}",
  user_manager_overlay_global_summary: "GlobalUser: {value}",
  user_manager_overlay_inherit_global: "InheritGlobal",
  user_manager_overlay_scope_dialog_title: "Bind User Into Which Scope",
  user_manager_overlay_scope_workspace_title: "Current Workspace",
  user_manager_overlay_scope_workspace_subtitle: "Save this user into the current workspace setting.",
  user_manager_overlay_scope_global_title: "Global Setting",
  user_manager_overlay_scope_global_subtitle: "Save this user into the shared public setting.",
  user_manager_overlay_scope_delete_title: "Delete Account",
  user_manager_overlay_scope_delete_subtitle:
    "Delete this account from VMM after one confirmation flow.",
  user_manager_overlay_replace_global_title: "Choose One Global Replacement",
  user_manager_overlay_account_label: "Account#{name}",
  user_manager_overlay_id_label: "ID#{id}",
  user_manager_overlay_toast_title: "User Manager",
  user_manager_overlay_status_loaded: "UserCount:{count}",
  user_manager_overlay_status_bound: "{scope} is now bound to {name} ({id}).",
  user_manager_overlay_status_cleared: "Workspace user override has been cleared.",
  user_manager_overlay_status_deleted: "Deleted {name} ({id}).",
  user_manager_overlay_delete_prompt_title: "Type Account Name To Delete",
  user_manager_overlay_delete_prompt_placeholder: "Type {name}",
  user_manager_overlay_delete_prompt_warning:
    "Deleting this account will also remove bound session history, profile data, and related records.",
  user_manager_overlay_delete_prompt_expected:
    "If you still want to continue, type the exact account name: {name}",
  user_manager_overlay_delete_prompt_retry:
    "If the input is wrong, you can retry here or press Esc to cancel.",
  user_manager_overlay_delete_prompt_empty: "Please type the exact account name first.",
  user_manager_overlay_delete_prompt_mismatch:
    "Input mismatch. Please type {name} exactly, or press Esc to cancel.",
  user_manager_overlay_delete_effect_workspace_inherit:
    "The current workspace will fall back to the shared public setting.",
  user_manager_overlay_delete_effect_global_replace:
    "The shared public setting will switch to {value}.",
  user_manager_overlay_delete_missing_global_replacement:
    "This account is still the shared public user. Create or bind another user first.",
  project_manager_overlay_filter_placeholder: "Filter project paths...",
  project_manager_overlay_list_title: "Project Manager",
  project_manager_overlay_loading: "Loading project list...",
  project_manager_overlay_empty: "No project matches the current filter.",
  project_manager_overlay_keys_hint:
    "Type to filter | ↑↓/j/k navigate | Enter open | Esc/right-click close",
  project_manager_overlay_group_actions: "Functions",
  project_manager_overlay_group_projects: "Project List",
  project_manager_overlay_add_title: "Add Project",
  project_manager_overlay_add_subtitle: "Create one Team/Space/Project path.",
  project_manager_overlay_clear_workspace_title: "Clear Workspace Setting",
  project_manager_overlay_clear_workspace_subtitle:
    "Clear it and fall back to the shared public project setting.",
  project_manager_overlay_workspace_summary: "WorkspaceProject: {value}",
  project_manager_overlay_global_summary: "GlobalProject: {value}",
  project_manager_overlay_inherit_global: "InheritGlobal",
  project_manager_overlay_scope_dialog_title: "Save This Project Into Which Scope",
  project_manager_overlay_scope_workspace_title: "Current Workspace",
  project_manager_overlay_scope_workspace_subtitle:
    "Save this project into the current workspace setting.",
  project_manager_overlay_scope_global_title: "Global Setting",
  project_manager_overlay_scope_global_subtitle:
    "Save this project into the shared public setting.",
  project_manager_overlay_scope_delete_title: "Delete Project",
  project_manager_overlay_scope_delete_subtitle:
    "Delete this project after exact-path confirmation.",
  project_manager_overlay_scope_migrate_title: "Migrate Project",
  project_manager_overlay_scope_migrate_subtitle:
    "Move this project into another Team/Space/Project path.",
  project_manager_overlay_replace_global_title: "Choose One Global Replacement Project",
  project_manager_overlay_id_label: "ID#{id}",
  project_manager_overlay_toast_title: "Project Manager",
  project_manager_overlay_status_loaded: "ProjectCount:{count}",
  project_manager_overlay_status_bound: "{scope} is now bound to {path} ({id}).",
  project_manager_overlay_status_cleared: "Workspace project override has been cleared.",
  project_manager_overlay_status_created: "Created and bound {path} ({id}) into {scope}.",
  project_manager_overlay_status_resolved:
    "This project already exists. Bound {path} ({id}) into {scope}.",
  project_manager_overlay_status_deleted: "Deleted {path} ({id}).",
  project_manager_overlay_status_migrated: "Migrated {source} to {target}.",
  project_manager_overlay_delete_running: "Deleting project via gRPC...",
  project_manager_overlay_migrate_running: "Migrating project via gRPC...",
  project_manager_overlay_delete_prompt_title: "Type Full Project Path To Delete",
  project_manager_overlay_delete_prompt_placeholder: "Type {path}",
  project_manager_overlay_delete_prompt_warning:
    "Deleting this project will also remove bound sessions, messages, memories, profiles, and vector data in this project scope.",
  project_manager_overlay_delete_prompt_expected:
    "If you still want to continue, type the exact full project path: {path}",
  project_manager_overlay_delete_prompt_retry:
    "If the input is wrong, you can retry here or press Esc to cancel.",
  project_manager_overlay_delete_prompt_empty:
    "Please type the exact full project path first.",
  project_manager_overlay_delete_prompt_mismatch:
    "Input mismatch. Please type the exact full project path: {path}",
  project_manager_overlay_delete_effect_workspace_inherit:
    "The current workspace will fall back to the shared public project setting.",
  project_manager_overlay_delete_effect_global_replace:
    "The shared public project setting will switch to {value}.",
  project_manager_overlay_delete_missing_global_replacement:
    "This project is still the shared public project. Bind another project first.",
  project_manager_overlay_delete_backend_confirm_title: "Confirm Project Deletion",
  project_manager_overlay_delete_backend_confirm_message:
    "The backend requires one more explicit confirmation before deleting this project. Continue?",
  project_manager_overlay_migrate_prompt_title: "Migrate Project",
  project_manager_overlay_migrate_prompt_placeholder:
    "TargetTeam/TargetSpace/TargetProject",
  project_manager_overlay_migrate_prompt_description:
    "Enter the target Team/Space/Project path for the currently selected project.",
  project_manager_overlay_migrate_prompt_empty:
    "The target project path cannot be empty.",
  project_manager_overlay_migrate_confirm_input_title: "Confirm Project Migration",
  project_manager_overlay_migrate_confirm_input_placeholder: "Type {value}",
  project_manager_overlay_migrate_confirm_input_warning:
    "Migration may redirect project bindings and move project-scoped history into the new target path.",
  project_manager_overlay_migrate_confirm_input_expected:
    "If you still want to continue, type the exact migration spec: {value}",
  project_manager_overlay_migrate_confirm_input_retry:
    "If the input is wrong, you can retry here or press Esc to cancel.",
  project_manager_overlay_migrate_confirm_input_empty:
    "Please type the exact migration spec first.",
  project_manager_overlay_migrate_confirm_input_mismatch:
    "Input mismatch. Please type the exact migration spec: {value}",
  project_manager_overlay_migrate_backend_confirm_title: "Confirm Project Migration",
  project_manager_overlay_migrate_backend_confirm_message:
    "The backend requires one more explicit confirmation before migrating this project. Continue?",
  project_manager_overlay_migrate_effect_workspace_switch:
    "The current workspace project binding will switch to {value}.",
  project_manager_overlay_migrate_effect_global_switch:
    "The shared public project binding will switch to {value}.",
  project_manager_overlay_invalid_path:
    "Provide one canonical Team/Space/Project path with exactly three non-empty segments.",
  project_manager_overlay_error_invalid_path:
    "The project path is invalid. Use one canonical Team/Space/Project path.",
  project_manager_overlay_error_exists:
    "This project path already exists. Select it from the list or bind the resolved project instead.",
  project_manager_overlay_error_conflict:
    "This project path conflicts with existing hierarchy data. Adjust the path and try again.",
  project_manager_overlay_error_confirmation:
    "This project path still requires explicit confirmation before creation.",
  project_manager_title: "Vulcan Project Manager",
  project_manager_subtitle: "Live Vulcan projects on the left. Details and write scope on the right.",
  project_manager_section_list: "Project List",
  project_manager_section_actions: "Actions",
  project_manager_section_projects: "Live Projects",
  project_manager_details_fallback: "Details",
  project_manager_status: "Status",
  project_manager_current_project: "Current effective project_id: {value}",
  project_manager_current_scope_project: "Current {scope} project_id: {value}",
  project_manager_loading: "Loading project list...",
  project_manager_missing_grpc: "vulcan_host_target is not configured yet.",
  project_manager_loaded_projects: "Loaded {count} projects.",
  project_manager_item_current_subtitle: "#{id} · current effective project",
  project_manager_item_scope_current_subtitle: "#{id} · current {scope} binding",
  project_manager_item_bind_subtitle: "#{id} · bind to selected scope",
  project_manager_already_bound_in_scope:
    "This project is already bound in the selected scope ({scope}).",
  project_manager_status_bound: "Bound {scope} project_id to {path}.",
  project_manager_status_ensuring: "Ensuring project path \"{path}\"...",
  project_manager_status_created: "Project created and bound: {path}.",
  project_manager_status_resolved: "Project resolved and bound: {path}.",
  project_manager_status_cleared: "{scope} project binding has been cleared.",
  project_manager_toast_title: "Vulcan Project Manager",
  project_manager_toast_switched: "{scope} project switched to {path}.",
  project_manager_keys_hint: "Keys: Up/Down to select, Enter to act, Esc to go back.",
  project_manager_new_title: "New Project Path",
  project_manager_new_subtitle: "Resolve or create one Team/Space/Project path.",
  project_manager_new_detail_1: "Open a prompt to enter one canonical Team/Space/Project path.",
  project_manager_new_detail_2:
    "The manager will call EnsureProject with confirm_create=true.",
  project_manager_new_detail_3:
    "If any segment is missing, VMM will create it before binding the final project.",
  project_manager_new_prompt_title: "New VMM Project Path",
  project_manager_new_prompt_placeholder: "Team/Space/Project",
  project_manager_new_prompt_description:
    "Input one canonical Team/Space/Project path, then press Enter to resolve or create it.",
  project_manager_new_prompt_empty: "Project path cannot be empty.",
  project_manager_refresh_title: "Refresh Project List",
  project_manager_refresh_subtitle: "Reload live project data from VMM.",
  project_manager_refresh_detail_1: "Reload the live project list from VMM.",
  project_manager_refresh_detail_2:
    "Use this after creating or migrating projects elsewhere, or after a backend restart.",
  project_manager_clear_title: "Clear Bound Project",
  project_manager_clear_subtitle: "Clear the selected scope project binding.",
  project_manager_clear_detail_1:
    "Remove the current project_id override from the selected write scope.",
  project_manager_clear_detail_2:
    "The effective project may still come from the other scope after clearing.",
  language_control_title: "VMM Language Control",
  language_control_subtitle: "Choose one local or global UI language override for VMM.",
  language_control_section_list: "Languages",
  language_control_details_fallback: "Details",
  language_control_current_effective: "Current effective language: {value}",
  language_control_write_scope: "Current write scope: {scope}",
  language_control_status: "Status",
  language_control_toast_title: "VMM Language Control",
  language_control_saved: "{scope} language is now set to {value}.",
  language_control_cleared: "{scope} language override has been cleared.",
  language_control_keys_hint: "Keys: Up/Down to select, Enter to apply, Esc to go back.",
  language_control_list_title: "Language List",
  language_control_loading: "Loading language list...",
  language_control_group_actions: "Functions",
  language_control_group_languages: "Language List",
  language_control_workspace_summary: "WorkspaceLanguage:{value}",
  language_control_global_summary: "GlobalLanguage:{value}",
  language_control_effective_summary: "Effective:{value}",
  language_control_inherit_global_value: "Inherit Global",
  language_control_status_loaded: "LanguageCount:{count}",
  language_control_scope_dialog_title: "Where should this language be saved",
  language_control_scope_workspace_title: "Current Workspace",
  language_control_scope_workspace_subtitle: "Save this language into the current workspace setting.",
  language_control_scope_global_title: "Global Setting",
  language_control_scope_global_subtitle: "Save this language into the shared global setting.",
  language_control_clear_title: "Workspace Language Inherit Global",
  language_control_clear_subtitle: "Clear the workspace language override and inherit the global setting.",
  language_control_clear_detail_1:
    "Remove the selected-scope language override and inherit from the other layers again.",
  language_control_clear_detail_2:
    "Command-palette descriptions still need an OpenCode restart to refresh.",
  memory_settings_title: "VMM Memory Settings",
  memory_settings_subtitle: "Choose one function first, then choose the write scope.",
  memory_settings_section_list: "Memory Controls",
  memory_settings_loading: "Loading memory settings...",
  memory_settings_scope_dialog_title: "Save This Memory Setting Into Which Scope",
  memory_settings_scope_workspace_title: "Current Workspace",
  memory_settings_scope_workspace_subtitle:
    "Save this memory setting into the current workspace setting.",
  memory_settings_scope_global_title: "Global Setting",
  memory_settings_scope_global_subtitle:
    "Save this memory setting into the shared public setting.",
  memory_settings_toast_title: "VMM Memory Settings",
  memory_settings_keys_hint:
    "Keys: Up/Down to select, Enter continue, Esc/right-click close.",
  memory_settings_inherit_value: "Inherit",
  memory_settings_state_pair: "Project:{project}|Global:{global}",
  memory_settings_session_compact_enabled_value: "On",
  memory_settings_session_compact_disabled_value: "Off",
  memory_settings_mode_adjust_title: "Adjust Injection Mode",
  memory_settings_mode_adjust_subtitle:
    "Switch between visible and implicit memory injection.",
  memory_settings_mode_select_title: "Choose Injection Mode For {scope}",
  memory_settings_mode_visible_title: "Visible Injection Mode",
  memory_settings_mode_visible_subtitle: "Choose a scope, then switch it to visible memory injection.",
  memory_settings_mode_visible_detail_1:
    "Visible mode injects retrieved memory as explicit text into the conversation context.",
  memory_settings_mode_visible_detail_2:
    "Choose this when you want the recalled memory to stay visibly inspectable.",
  memory_settings_mode_implicit_title: "Implicit Injection Mode",
  memory_settings_mode_implicit_subtitle: "Switch the selected scope to implicit memory injection.",
  memory_settings_mode_implicit_detail_1:
    "Implicit mode hides the injected memory text while still influencing the turn.",
  memory_settings_mode_implicit_detail_2:
    "Use implicit turns to control how much recent context can be reused.",
  memory_settings_turns_title: "Set Implicit Turns",
  memory_settings_turns_subtitle: "Choose a scope, then edit its implicit_memory_turns value.",
  memory_settings_turns_detail_1:
    "Open a prompt and enter one non-negative integer for implicit_memory_turns.",
  memory_settings_turns_detail_2:
    "This value controls how many recent turns are considered for implicit injection.",
  memory_settings_turns_prompt_title: "Set Implicit Turns",
  memory_settings_turns_prompt_placeholder: "Non-negative integer",
  memory_settings_turns_prompt_description:
    "Input one non-negative integer, then press Enter to save implicit_memory_turns.",
  memory_settings_turns_prompt_empty: "The implicit turns value cannot be empty.",
  memory_settings_turns_prompt_invalid: "implicit_memory_turns must be a non-negative integer.",
  memory_settings_profile_refresh_title: "Set Profile Refresh Turns",
  memory_settings_profile_refresh_subtitle:
    "Choose a scope, then edit its profile_refresh_turns value.",
  memory_settings_profile_refresh_detail_1:
    "Open a prompt and enter one non-negative integer for profile_refresh_turns.",
  memory_settings_profile_refresh_detail_2:
    "This value controls how many accepted turns can pass before the profile bundle refreshes.",
  memory_settings_profile_refresh_prompt_title: "Set Profile Refresh Turns",
  memory_settings_profile_refresh_prompt_placeholder: "Non-negative integer",
  memory_settings_profile_refresh_prompt_description:
    "Input one non-negative integer, then press Enter to save profile_refresh_turns.",
  memory_settings_profile_refresh_prompt_empty:
    "The profile refresh turns value cannot be empty.",
  memory_settings_profile_refresh_prompt_invalid:
    "profile_refresh_turns must be a non-negative integer.",
  memory_settings_session_compact_adjust_title: "Adjust Compact-Aware Recall",
  memory_settings_session_compact_adjust_subtitle:
    "Control compact-aware recall and compact notifications.",
  memory_settings_session_compact_select_title:
    "Choose Compact-Aware Recall Mode For {scope}",
  memory_settings_session_compact_on_title: "Enable Session-Compact Recall",
  memory_settings_session_compact_on_subtitle:
    "Choose a scope, then enable compact-aware recall and compact notifications.",
  memory_settings_session_compact_on_detail_1:
    "When enabled, PreCheck uses session compact recall mode and the compact hook sends ChatCompact acknowledgements.",
  memory_settings_session_compact_on_detail_2:
    "Use this when the current workspace should avoid recalling the still-live uncompressed tail after compaction.",
  memory_settings_session_compact_off_title: "Disable Session-Compact Recall",
  memory_settings_session_compact_off_subtitle:
    "Choose a scope, then fall back to legacy PreCheck recall without compact notifications.",
  memory_settings_session_compact_off_detail_1:
    "When disabled, the compact hook does not notify VMM and PreCheck keeps the legacy recall mode.",
  memory_settings_session_compact_off_detail_2:
    "Use this only when the current host or workflow should not participate in compact-aware recall.",
  memory_settings_saved_visible: "{scope} mode switched to visible injection.",
  memory_settings_saved_implicit: "{scope} mode switched to implicit injection.",
  memory_settings_saved_turns: "{scope} implicit turns are now set to {value}.",
  memory_settings_saved_profile_refresh:
    "{scope} profile refresh turns are now set to {value}.",
  memory_settings_saved_session_compact_on:
    "{scope} compact-aware recall is now enabled.",
  memory_settings_saved_session_compact_off:
    "{scope} compact-aware recall is now disabled.",
  grpc_transport_section_list: "gRPC Transport Controls",
  grpc_transport_loading: "Loading gRPC transport settings...",
  grpc_transport_scope_dialog_title: "Save This gRPC Transport Setting Into Which Scope",
  grpc_transport_scope_workspace_subtitle:
    "Save this gRPC transport setting into the current workspace setting.",
  grpc_transport_scope_global_subtitle:
    "Save this gRPC transport setting into the shared global setting.",
  grpc_transport_toast_title: "gRPC Transport Settings",
  grpc_transport_vulcan_host_target_title: "Set Vulcan Host Target",
  grpc_transport_vulcan_host_target_subtitle:
    "Only plugin-side endpoint for VMM, LuaSkills, and future host services.",
  grpc_transport_endpoint_plan_summary:
    "Plan: {mode}; effective={effective}",
  grpc_transport_endpoint_prompt_placeholder: "host:port or ${ENV_NAME}; empty inherits",
  grpc_transport_endpoint_prompt_description:
    "Enter a whitespace-free gRPC target. Leave empty to clear this scope and inherit.",
  grpc_transport_endpoint_prompt_invalid:
    "Endpoint target must be empty or one whitespace-free gRPC target.",
  grpc_transport_vulcan_host_target_prompt_title: "Set vulcan_host_target",
  grpc_transport_saved_vulcan_host_target:
    "Saved {scope} vulcan_host_target as {value}.",
  grpc_transport_keepalive_time_title: "Set Keepalive Time",
  grpc_transport_keepalive_time_subtitle:
    "Choose a scope, then edit grpc_keepalive_time_ms.",
  grpc_transport_keepalive_timeout_title: "Set Keepalive Timeout",
  grpc_transport_keepalive_timeout_subtitle:
    "Choose a scope, then edit grpc_keepalive_timeout_ms.",
  grpc_transport_permit_title: "Adjust Permit-Without-Calls",
  grpc_transport_permit_subtitle:
    "Choose a scope, then switch grpc_keepalive_permit_without_calls.",
  grpc_transport_save_failed:
    "Failed to save the gRPC transport setting. Please try again.",
  grpc_transport_keepalive_time_prompt_title: "Set Keepalive Time (ms)",
  grpc_transport_keepalive_time_prompt_placeholder: "Positive integer milliseconds",
  grpc_transport_keepalive_time_prompt_description:
    "Enter grpc_keepalive_time_ms. It controls how often an idle connection sends a keepalive ping.",
  grpc_transport_keepalive_time_prompt_empty: "The keepalive time cannot be empty.",
  grpc_transport_keepalive_time_prompt_invalid:
    "grpc_keepalive_time_ms must be a positive integer.",
  grpc_transport_keepalive_timeout_prompt_title: "Set Keepalive Timeout (ms)",
  grpc_transport_keepalive_timeout_prompt_placeholder: "Positive integer milliseconds",
  grpc_transport_keepalive_timeout_prompt_description:
    "Enter grpc_keepalive_timeout_ms. It controls how long one keepalive waits for an ACK.",
  grpc_transport_keepalive_timeout_prompt_empty:
    "The keepalive timeout cannot be empty.",
  grpc_transport_keepalive_timeout_prompt_invalid:
    "grpc_keepalive_timeout_ms must be a positive integer.",
  grpc_transport_keepalive_timeout_exceeds_time:
    "The keepalive timeout must be less than the keepalive time.",
  grpc_transport_keepalive_time_below_timeout:
    "The keepalive time must not be less than the current timeout.",
  grpc_transport_permit_select_title:
    "Choose permit-without-calls behavior for {scope}",
  grpc_transport_permit_disabled_title: "Disable Idle Pings Without Calls",
  grpc_transport_permit_disabled_subtitle:
    "Allow keepalive only while active RPC calls exist.",
  grpc_transport_permit_enabled_title: "Enable Idle Pings Without Calls",
  grpc_transport_permit_enabled_subtitle:
    "Allow keepalive even when no active RPC call exists.",
  grpc_transport_saved_keepalive_time:
    "{scope} keepalive time is now {value} ms.",
  grpc_transport_saved_keepalive_timeout:
    "{scope} keepalive timeout is now {value} ms.",
  grpc_transport_saved_permit_on:
    "{scope} permit-without-calls is now enabled.",
  grpc_transport_saved_permit_off:
    "{scope} permit-without-calls is now disabled.",
  profile_center_title: "VMM Profile Center",
  profile_center_subtitle: "Choose one profile target, inspect its nodes, or add one manual instruction.",
  profile_center_section_list: "Profile Items",
  profile_center_section_targets: "Targets",
  profile_center_section_actions: "Actions",
  profile_center_section_nodes: "Active Node Table",
  profile_center_details_fallback: "Details",
  profile_center_current_target: "Current profile target: {value}",
  profile_center_status: "Status",
  profile_target_selected_subtitle: "{value} is the current profile target.",
  profile_target_switch_subtitle: "Switch the current profile target to {value}.",
  profile_center_loading: "Loading profile nodes...",
  profile_center_no_binding_user: "A valid user_id is required before opening the user profile target.",
  profile_center_no_binding_project: "A valid project_id is required before opening this profile target.",
  profile_center_no_nodes: "No active profile nodes were returned for this target.",
  profile_center_loaded_nodes: "Loaded {count} active profile nodes.",
  profile_center_applying: "Applying one manual profile instruction...",
  profile_center_toast_title: "VMM Profile Center",
  profile_center_keys_hint: "Keys: Up/Down to select, Enter to act, Esc to go back.",
  profile_center_refresh_title: "Refresh Profile Nodes",
  profile_center_refresh_subtitle: "Reload active nodes for the current target.",
  profile_center_refresh_detail_1:
    "Reload the current target from VMM using the backend maximum slice.",
  profile_center_refresh_detail_2:
    "Use this after manual edits or when backend profile data may have changed.",
  profile_center_add_title: "Add Manual Instruction",
  profile_center_add_subtitle: "Write one manual profile instruction onto the current target.",
  profile_center_add_detail_1:
    "Open a prompt and input one natural-language profile instruction.",
  profile_center_add_detail_2:
    "The backend will review the instruction, accept new nodes, and retire old ones synchronously.",
  profile_center_add_detail_3:
    "Team and space profile writes ask for one extra confirm step here because they are broad rules.",
  profile_center_add_prompt_title: "Manual Profile Instruction",
  profile_center_add_prompt_placeholder: "Natural-language instruction",
  profile_center_add_prompt_description:
    "Describe the manual profile fact or preference you want VMM to keep.",
  profile_center_add_prompt_empty: "The profile instruction cannot be empty.",
  profile_center_confirm_title: "Confirm High-Authority Profile Update",
  profile_center_confirm_message:
    "This target writes a broad, high-authority profile rule. Confirm that you want to continue.",
  profile_center_applied: "Profile instruction applied. Accepted {accepted} nodes and retired {retired}.",
  profile_center_launcher_title: "Profile Center",
  profile_center_launcher_subtitle:
    "Choose one target first, then open the corresponding profile workspace.",
  profile_center_launcher_hint: "Keys: Up/Down choose target, Enter open, Esc/right-click go back.",
  profile_center_launcher_status_idle: "Choose one profile target to begin.",
  profile_bundle_test_title: "Full Profile Bundle Test",
  profile_bundle_test_section_actions: "Actions",
  profile_bundle_test_section_bundle: "Full Bundle",
  profile_bundle_test_refresh_title: "Refresh Full Bundle",
  profile_bundle_test_refresh_subtitle:
    "Fetch the latest FULL bundle for the current user/project pair.",
  profile_bundle_test_loading: "Loading full profile bundle...",
  profile_bundle_test_missing_scope:
    "The full bundle needs both current user_id and project_id bindings.",
  profile_bundle_test_status_idle:
    "Select refresh to load the current full profile bundle.",
  profile_bundle_test_status_loaded: "Loaded full bundle text ({count} chars).",
  profile_bundle_test_empty: "No full bundle text is available yet.",
  profile_bundle_test_keys_hint: "Keys: Enter refresh | Esc/right-click return.",
  tools_debug_title: "VMM Tools Debug",
  tools_debug_section_actions: "Actions",
  tools_debug_section_request: "Latest Request",
  tools_debug_section_response: "Latest Response",
  tools_debug_status_idle:
    "Select one action to start probing the current gRPC interfaces.",
  tools_debug_loading: "Running {label}...",
  tools_debug_missing_grpc: "vulcan_host_target is not configured yet.",
  tools_debug_missing_scope:
    "This action needs both current user_id and project_id bindings.",
  tools_debug_request_empty: "No request has been executed yet.",
  tools_debug_response_empty: "No response is available yet.",
  tools_debug_keys_hint: "Keys: Up/Down select | Enter run | Esc/right-click return.",
  tools_debug_action_healthz_title: "Healthz",
  tools_debug_action_healthz_subtitle:
    "Probe transport reachability without business scope.",
  tools_debug_action_search_memory_title: "SearchMemoryEvents",
  tools_debug_action_search_memory_subtitle:
    "Run one simple-query active memory search for the current bindings.",
  tools_debug_action_turn_details_title: "GetTurnDetails",
  tools_debug_action_turn_details_subtitle:
    "Read structured source-turn details by exact turn ids.",
  tools_debug_action_write_memories_title: "WriteMemories",
  tools_debug_action_write_memories_subtitle:
    "Fill the real AI-facing memory fields and write one direct memory item into the current bindings.",
  tools_debug_search_prompt_title: "Search Query Lines",
  tools_debug_search_prompt_placeholder:
    "release checklist\nconfirmed concurrency decision",
  tools_debug_search_prompt_description:
    "Input one complete query per line. Keep each query on its own line because commas are valid query content. The simplified API no longer uses background => query.",
  tools_debug_search_prompt_empty: "The query list cannot be empty.",
  tools_debug_search_prompt_invalid:
    "Provide at least one non-empty query line. Keep each query on its own line.",
  tools_debug_search_topk_prompt_title: "Search TopK",
  tools_debug_search_topk_prompt_placeholder: "Positive integer",
  tools_debug_search_topk_prompt_description:
    "Input one positive integer for top_k, then press Enter.",
  tools_debug_search_topk_prompt_empty: "top_k cannot be empty.",
  tools_debug_search_topk_prompt_invalid: "top_k must be a positive integer.",
  tools_debug_turn_prompt_title: "Turn Detail IDs",
  tools_debug_turn_prompt_placeholder: "1\n2",
  tools_debug_turn_prompt_description:
    "Input one source_turn_id per line, or separate them with commas. Use ids returned by SearchMemoryEvents when source_turn_id is not 0.",
  tools_debug_turn_prompt_empty: "The turn id list cannot be empty.",
  tools_debug_turn_prompt_invalid:
    "Use one positive integer per line, or provide a comma-separated list such as 1,2.",
  tools_debug_write_prompt_title: "Write Memory Field",
  tools_debug_write_prompt_placeholder: "Write one required field",
  tools_debug_write_prompt_description:
    "Fill the write-memory fields step by step. abstract, details, and category are required in the simplified API.",
  tools_debug_write_prompt_empty: "This write-memory field cannot be empty.",
  tools_debug_write_prompt_invalid:
    "Provide one valid non-empty value for this write-memory field.",
  tools_debug_write_abstract_prompt_title: "Memory Abstract",
  tools_debug_write_abstract_prompt_placeholder: "Describe the durable fact to keep",
  tools_debug_write_abstract_prompt_description:
    "Input the abstract text for one direct memory item. This field is required.",
  tools_debug_write_details_prompt_title: "Memory Details",
  tools_debug_write_details_prompt_placeholder: "Full durable memory text",
  tools_debug_write_details_prompt_description:
    "Input the full durable memory text. This field is required by the simplified API.",
  tools_debug_write_scope_prompt_title: "Memory Scope",
  tools_debug_write_scope_prompt_description:
    "Choose the scope level that should own this memory item.",
  tools_debug_write_scope_session_title: "Session Scope",
  tools_debug_write_scope_session_subtitle:
    "Keep the memory at the current session level for narrow temporary reuse.",
  tools_debug_write_scope_project_title: "Project Scope",
  tools_debug_write_scope_project_subtitle:
    "Share the memory across the current project binding. This is the usual default.",
  tools_debug_write_scope_user_title: "User Scope",
  tools_debug_write_scope_user_subtitle:
    "Keep the memory reusable across projects for the current bound user.",
  tools_debug_write_priority_prompt_title: "Memory Priority",
  tools_debug_write_priority_prompt_description:
    "Choose how strongly the backend should prioritize this memory item.",
  tools_debug_write_priority_p0_title: "P0",
  tools_debug_write_priority_p0_subtitle: "Highest priority for strongly durable memory.",
  tools_debug_write_priority_p1_title: "P1",
  tools_debug_write_priority_p1_subtitle:
    "Balanced default priority for ordinary durable memory.",
  tools_debug_write_priority_p2_title: "P2",
  tools_debug_write_priority_p2_subtitle:
    "Lower priority for weaker or more tentative memory.",
  tools_debug_write_level_prompt_title: "Memory Level",
  tools_debug_write_level_prompt_description:
    "Choose the backend memory layer for this direct write probe.",
  tools_debug_write_level_l0_title: "L0",
  tools_debug_write_level_l0_subtitle: "Shortest-lived or most local memory layer.",
  tools_debug_write_level_l1_title: "L1",
  tools_debug_write_level_l1_subtitle:
    "Default durable layer for common memory writes.",
  tools_debug_write_level_l2_title: "L2",
  tools_debug_write_level_l2_subtitle:
    "Higher-order layer for stronger long-term recall.",
  tools_debug_write_level_l3_title: "L3",
  tools_debug_write_level_l3_subtitle:
    "Highest durable layer for the strongest retained memory.",
  tools_debug_write_category_prompt_title: "Memory Category",
  tools_debug_write_category_prompt_placeholder: "Required integer 0-7",
  tools_debug_write_category_prompt_description:
    "Input one required category integer. 0=general, 1=architecture_decision, 2=tech_spec_api, 3=business_logic, 4=requirement_todo, 5=project_context, 6=logical_bug_debt, 7=security_policy.",
  tools_debug_write_category_prompt_invalid:
    "Category must be one integer between 0 and 7.",
  profile_center_workspace_header: "{value} Profile Workspace",
  profile_center_workspace_hint:
    "Keys: Left/Right actions, Up/Down nodes, Enter inspect or run, Esc/right-click back.",
  profile_center_filter_placeholder: "Filter profile nodes by content, source, id, or date...",
  profile_center_details_title: "Profile Node Details",
  profile_center_details_hint:
    "Select one node above to inspect the full detail tables below.",
  profile_center_details_meta_title: "Structured Fields",
  profile_center_details_story_title: "Detail and Reason",
  profile_workspace_action_add_subtitle:
    "Append one manual instruction for the current target and current node context.",
  profile_workspace_action_refresh_subtitle:
    "Reload active nodes for the current target from the backend.",
  profile_target_user_launcher: "User Profile",
  profile_target_project_launcher: "Project Profile",
  profile_target_space_launcher: "Space Profile",
  profile_target_team_launcher: "Team Profile",
  profile_detail_field_key: "Field",
  profile_detail_field_value: "Value",
  profile_detail_field_node_id: "Node ID",
  profile_detail_field_target: "Target",
  profile_detail_field_bind_id: "Bind ID",
  profile_detail_field_plw: "P/L/W",
  profile_detail_field_priority: "Priority",
  profile_detail_field_level: "Level",
  profile_detail_field_refresh_weight: "Refresh Weight",
  profile_detail_field_profile_date: "Profile Date",
  profile_detail_field_expires: "Expires",
  profile_detail_field_source: "Source",
  profile_detail_field_source_id: "Source ID",
  profile_detail_field_content: "Detailed Content",
  profile_detail_field_reason: "Why / Level Reason",
  profile_target_user: "User",
  profile_target_project: "Project",
  profile_target_team: "Team",
  profile_target_space: "Space",
  profile_node_scope: "Scope",
  profile_node_source: "Source",
  profile_node_expires: "Expires On",
  profile_node_reason: "Level Reason",
  profile_node_plw: "P/L/W",
  profile_table_id: "#ID",
  profile_table_scope: "Target",
  profile_table_plw: "P/L/W",
  profile_table_profile_date: "Profile Date",
  profile_table_expires: "Expires",
  profile_table_source: "Source",
  profile_table_content: "Content",
  scope_local_title: "Write Scope: Local",
  scope_global_title: "Write Scope: Global",
  scope_selected_subtitle: "{scope} is the current write scope.",
  scope_switch_subtitle: "Switch the current write scope to {scope}.",
  scope_detail_selected: "{scope} is already selected as the write scope.",
  scope_detail_switch: "Use this to write the next change into {scope}.",
  back_setting_title: "Back to Control Panel",
  back_setting_subtitle: "Return to the function list.",
  back_setting_detail_1: "Return to the top-level setting center.",
  back_setting_detail_2: "This keeps the user workflow list-first and window-based.",
  new_user_dialog_title: "New VMM User",
  new_user_dialog_placeholder: "Input user name",
  new_user_dialog_description:
    "Type a user name, then Enter to resolve or create it and bind it locally.",
  new_user_dialog_empty: "User name cannot be empty.",
  summary_ok: "{label}: ok",
  summary_handshake_timeout: "{label}: handshake timeout",
  summary_receive_timeout: "{label}: receive timeout",
  summary_failed: "{label}: failed",
}

/**
 * Simplified Chinese catalog for the first TUI multilingual release.
 * 第一版 TUI 多语言能力使用的简体中文目录。
 */
const VMM_TUI_CATALOG_ZH_CN: VmmTuiCatalog = {
  command_title: "Vulcan 控制面板",
  command_description: "打开 Vulcan 控制面板",
  mounted_entry_label: "Vulcan 控制面板",
  setting_title: "Vulcan 控制面板",
  setting_subtitle: "通过独立 TUI 窗口配置 Vulcan，而不是再生成助手回复。",
  setting_home_filter_placeholder: "按英文指令名快速过滤...",
  setting_home_list_title: "指令列表",
  setting_home_empty: "当前过滤条件下没有匹配的指令。",
  setting_home_keys_hint:
    "输入即可过滤 | ↑↓/j/k 移动 | Enter 打开 | Esc 清空/返回",
  setting_home_status_grpc: "gRPC",
  setting_home_status_user: "当前用户",
  setting_home_status_project: "当前项目",
  setting_home_status_language: "语言",
  setting_home_status_mode: "模式",
  setting_home_status_turns: "轮数",
  setting_home_status_compact: "压缩",
  setting_home_mode_visible: "显式",
  setting_home_mode_implicit: "隐式",
  setting_section_functions: "功能列表",
  setting_section_details: "说明",
  selector_scope_title: "写入范围",
  selector_target_title: "画像目标",
  dialog_select_keys_hint: "↑↓ 选择 | Enter 确认 | Esc/右键 取消",
  dialog_multiline_input_keys_hint: "Enter 换行 | Ctrl+Enter 确认 | Tab 切换按钮",
  setting_keys_hint: "按键：上下选择，回车打开，Esc 离开。",
  setting_current_language: "当前界面语言：{language}",
  setting_menu_user_manager_title: "用户管理",
  setting_menu_user_manager_subtitle: "列出、创建并切换 Vulcan 用户。",
  setting_menu_user_manager_detail_1: "打开独立的用户控制窗口。",
  setting_menu_user_manager_detail_2: "窗口会从 VMM 拉取实时用户列表。",
  setting_menu_user_manager_detail_3: "你可以直接切换到已有用户，也可以按名称创建新用户。",
  setting_menu_user_manager_detail_4: "可通过右侧选择面板在 local 与 global 写入范围之间切换。",
  setting_menu_project_manager_title: "项目管理",
  setting_menu_project_manager_subtitle: "列出、创建并切换 Vulcan 项目。",
  setting_menu_project_manager_detail_1: "打开独立的项目控制窗口。",
  setting_menu_project_manager_detail_2: "窗口会从 VMM 拉取实时项目列表。",
  setting_menu_project_manager_detail_3: "你可以绑定已有项目，也可以创建标准 Team/Space/Project 路径。",
  setting_menu_project_manager_detail_4: "项目管理支持 local 和 global 两种写入范围。",
  setting_menu_profile_center_title: "画像中心",
  setting_menu_profile_center_subtitle: "查看并编辑 active Vulcan 画像节点。",
  setting_menu_profile_center_detail_1: "在 user、project、team、space 四个画像目标之间切换。",
  setting_menu_profile_center_detail_2: "在同一个窗口里刷新 active 节点，或者追加一条手工画像指令。",
  setting_menu_profile_center_detail_3: "画像读取会主动请求后端最大切片，尽量保证审阅信息完整。",
  setting_menu_profile_bundle_test_title: "完整画像测试",
  setting_menu_profile_bundle_test_subtitle: "读取当前绑定关系下的后端完整画像 bundle。",
  setting_menu_profile_bundle_test_detail_1:
    "打开一个可后续直接移除的 GetProfileBundle 测试页。",
  setting_menu_profile_bundle_test_detail_2:
    "这个页面会通过 Node bridge 请求 FULL 模式，并直接展示返回文本。",
  setting_menu_tools_debug_title: "TOOLS 调试",
  setting_menu_tools_debug_subtitle:
    "按当前工作空间绑定测试与长期记忆 tools 相关的 Vulcan gRPC 接口。",
  setting_menu_tools_debug_detail_1:
    "打开一个独立调试页，测试长期记忆相关的对外 tools RPC。",
  setting_menu_tools_debug_detail_2:
    "页面会自动复用当前 vulcan_host_target，并在需要时复用当前 user/project 绑定和当前 session 路由上下文。",
  setting_menu_tools_debug_detail_3:
    "你可以直接查看原始请求和响应载荷，而不用离开 /vulcan-setting。",
  setting_menu_language_title: "语言控制",
  setting_menu_language_subtitle: "设置本地或全局的 Vulcan 界面语言覆盖值。",
  setting_menu_language_detail_1: "选择一个支持的语言，或者清空当前作用域里的语言覆盖。",
  setting_menu_language_detail_2: "当前 TUI 窗口会立即切换到新的生效语言。",
  setting_menu_language_detail_3: "命令面板里的说明仍然需要重启 OpenCode 才会刷新。",
  setting_menu_memory_title: "记忆设置",
  setting_menu_memory_subtitle: "配置显式/隐式模式、隐式轮数、画像刷新轮数和压缩感知召回。",
  setting_menu_memory_detail_1: "在显式记忆注入和隐式记忆注入之间切换。",
  setting_menu_memory_detail_2:
    "在同一个窗口里调整 implicit_memory_turns、profile_refresh_turns 和压缩感知召回开关。",
  setting_menu_memory_detail_3: "这里同样支持 local 和 global 两种写入范围。",
  setting_menu_grpc_transport_title: "gRPC 传输",
  setting_menu_grpc_transport_subtitle: "配置 vulcan-host 连接和 keepalive 策略。",
  setting_menu_grpc_transport_detail_1:
    "编辑 vulcan_host_target，作为插件侧唯一 gRPC 端点。",
  setting_menu_grpc_transport_detail_2:
    "VMM 与 LuaSkills 路由由 vulcan-host 在背后处理。",
  setting_menu_grpc_transport_detail_3:
    "在同一页面调整 keepalive 时间、超时和空闲期 ping 策略。",
  user_manager_title: "VMM 用户管理",
  user_manager_subtitle: "左侧是实时 VMM 用户列表，右侧显示详情和动作提示。",
  user_manager_section_list: "用户列表",
  user_manager_section_actions: "动作菜单",
  user_manager_section_users: "实时用户列表",
  user_manager_details_fallback: "说明",
  user_manager_status: "状态",
  user_manager_current_user: "当前生效 user_id：{value}",
  user_manager_current_scope_user: "当前 {scope} 的 user_id：{value}",
  user_manager_unset: "未设置",
  user_manager_bind_scope: "当前写入范围：{scope}",
  user_manager_loading: "正在加载用户列表...",
  user_manager_missing_grpc: "尚未配置 vulcan_host_target。",
  user_manager_loaded_users: "已加载 {count} 个用户。",
  user_manager_item_current_subtitle: "#{id} · 当前生效用户",
  user_manager_item_scope_current_subtitle: "#{id} · 当前 {scope} 绑定",
  user_manager_item_bind_subtitle: "#{id} · 绑定到 {scope}",
  user_manager_status_bound_local: "已将 {scope} 的 user_id 绑定到 {name} (#{id})。",
  user_manager_status_resolving: "正在解析用户“{name}”...",
  user_manager_status_created: "已创建用户：{name} (#{id})。",
  user_manager_status_resolved: "已解析用户：{name} (#{id})。",
  user_manager_status_switched: "已切换 {scope} 用户到 {name} (#{id})。",
  user_manager_no_selectable: "当前没有可选的 user-manager 项。",
  user_manager_selected_user: "当前选中用户：{name}",
  user_manager_selected_user_id: "用户 ID：{id}",
  user_manager_already_bound: "这个用户已经是当前生效绑定。",
  user_manager_already_bound_in_scope: "这个用户已经绑定到当前选中的作用域（{scope}）。",
  user_manager_press_bind: "按回车或点击即可把这个用户绑定到 {scope}。",
  user_manager_scope_note: "当前选中的写入范围是 {scope}。",
  user_manager_toast_title: "VMM 用户管理",
  user_manager_toast_switched: "已切换 {scope} 用户到 {name} (#{id})。",
  user_manager_keys_hint: "按键：上下选择，回车执行，Esc 返回。",
  user_manager_clear_title: "清空用户绑定",
  user_manager_clear_subtitle: "清空当前写入范围里的用户绑定。",
  user_manager_clear_detail_1: "移除当前写入范围里的 user_id 覆盖值。",
  user_manager_clear_detail_2: "清空后，最终生效用户可能仍然来自另一层作用域。",
  user_manager_status_cleared: "已清空 {scope} 的用户绑定。",
  user_manager_new_user_title: "新建用户",
  user_manager_new_user_subtitle: "按名称解析或创建一个用户。",
  user_manager_new_user_detail_1: "打开输入框，输入一个用户名称。",
  user_manager_new_user_detail_2: "管理页会调用 ResolveUser，并带上 confirm_create=true。",
  user_manager_new_user_detail_3: "如果用户不存在，VMM 会先创建它，再把它绑定到当前写入范围。",
  user_manager_refresh_title: "刷新用户列表",
  user_manager_refresh_subtitle: "重新从 VMM 加载实时数据。",
  user_manager_refresh_detail_1: "重新从 VMM 拉取实时用户列表。",
  user_manager_refresh_detail_2: "适合在别处创建完用户，或者后端重启后重新同步。",
  user_manager_overlay_filter_placeholder: "按名称过滤用户账号...",
  user_manager_overlay_list_title: "用户管理",
  user_manager_overlay_loading: "正在加载用户列表...",
  user_manager_overlay_empty: "当前过滤条件下没有匹配用户。",
  user_manager_overlay_keys_hint:
    "输入即可过滤 | ↑↓/j/k 移动 | Enter 打开 | Esc/右键返回",
  user_manager_overlay_group_actions: "功能列表",
  user_manager_overlay_group_users: "用户列表",
  user_manager_overlay_add_title: "新增用户",
  user_manager_overlay_add_subtitle: "新建一个用户用于适配个人画像。",
  user_manager_overlay_clear_workspace_title: "取消当前工作空间设置",
  user_manager_overlay_clear_workspace_subtitle: "取消后使用公共用户设置。",
  user_manager_overlay_workspace_summary: "工作空间用户：{value}",
  user_manager_overlay_global_summary: "公共设置用户：{value}",
  user_manager_overlay_inherit_global: "继承公共配置",
  user_manager_overlay_scope_dialog_title: "把这个用户保存到哪里",
  user_manager_overlay_scope_workspace_title: "当前工作空间",
  user_manager_overlay_scope_workspace_subtitle: "把这个用户写入当前工作空间设置。",
  user_manager_overlay_scope_global_title: "公共设置",
  user_manager_overlay_scope_global_subtitle: "把这个用户写入公共设置。",
  user_manager_overlay_scope_delete_title: "删除账号",
  user_manager_overlay_scope_delete_subtitle: "走一次确认流程后，把这个账号从 VMM 里删除。",
  user_manager_overlay_replace_global_title: "为公共设置选择替代账号",
  user_manager_overlay_account_label: "账号#{name}",
  user_manager_overlay_id_label: "编号#{id}",
  user_manager_overlay_toast_title: "用户管理",
  user_manager_overlay_status_loaded: "用户数量：{count}",
  user_manager_overlay_status_bound: "已把 {scope} 绑定到 {name}（{id}）。",
  user_manager_overlay_status_cleared: "已取消当前工作空间用户设置。",
  user_manager_overlay_status_deleted: "已删除 {name}（{id}）。",
  user_manager_overlay_delete_prompt_title: "输入账号名以确认删除",
  user_manager_overlay_delete_prompt_placeholder: "请输入 {name}",
  user_manager_overlay_delete_prompt_warning:
    "删除这个账号后，会同时删除所有绑定的 session 记录、画像数据以及相关关联信息。",
  user_manager_overlay_delete_prompt_expected: "如果你确定继续，请输入准确账号名：{name}",
  user_manager_overlay_delete_prompt_retry: "如果输入错误，可以继续重输，或者按 Esc 取消。",
  user_manager_overlay_delete_prompt_empty: "请先输入准确账号名。",
  user_manager_overlay_delete_prompt_mismatch: "输入错误，请准确输入 {name}，或者按 Esc 取消。",
  user_manager_overlay_delete_effect_workspace_inherit: "当前工作空间会自动回退到公共设置。",
  user_manager_overlay_delete_effect_global_replace: "公共设置会切换到 {value}。",
  user_manager_overlay_delete_missing_global_replacement:
    "这个账号当前仍是公共设置绑定用户。请先创建或选择另一个账号。",
  project_manager_overlay_filter_placeholder: "按路径过滤项目...",
  project_manager_overlay_list_title: "项目管理",
  project_manager_overlay_loading: "正在加载项目列表...",
  project_manager_overlay_empty: "当前过滤条件下没有匹配项目。",
  project_manager_overlay_keys_hint: "输入即可过滤 | ↑↓/j/k 移动 | Enter 打开 | Esc/右键关闭",
  project_manager_overlay_group_actions: "功能列表",
  project_manager_overlay_group_projects: "项目列表",
  project_manager_overlay_add_title: "新增项目",
  project_manager_overlay_add_subtitle: "新建一个 Team/Space/Project 路径。",
  project_manager_overlay_clear_workspace_title: "取消当前工作空间设置",
  project_manager_overlay_clear_workspace_subtitle: "取消后使用公共项目设置。",
  project_manager_overlay_workspace_summary: "工作空间项目：{value}",
  project_manager_overlay_global_summary: "公共设置项目：{value}",
  project_manager_overlay_inherit_global: "继承公共配置",
  project_manager_overlay_scope_dialog_title: "把这个项目保存到哪里",
  project_manager_overlay_scope_workspace_title: "当前工作空间",
  project_manager_overlay_scope_workspace_subtitle: "把这个项目写入当前工作空间设置。",
  project_manager_overlay_scope_global_title: "公共设置",
  project_manager_overlay_scope_global_subtitle: "把这个项目写入公共设置。",
  project_manager_overlay_scope_delete_title: "删除项目",
  project_manager_overlay_scope_delete_subtitle: "先做完整路径确认，再删除这个项目。",
  project_manager_overlay_scope_migrate_title: "迁移项目",
  project_manager_overlay_scope_migrate_subtitle:
    "把这个项目迁移到另一条 Team/Space/Project 路径。",
  project_manager_overlay_replace_global_title: "选择一个新的公共项目",
  project_manager_overlay_id_label: "编号#{id}",
  project_manager_overlay_toast_title: "项目管理",
  project_manager_overlay_status_loaded: "项目数量：{count}",
  project_manager_overlay_status_bound: "已把 {scope} 绑定到 {path}（{id}）。",
  project_manager_overlay_status_cleared: "已取消当前工作空间项目设置。",
  project_manager_overlay_status_created: "已创建并把 {scope} 绑定到 {path}（{id}）。",
  project_manager_overlay_status_resolved: "这个项目已存在，已把 {scope} 绑定到 {path}（{id}）。",
  project_manager_overlay_status_deleted: "已删除 {path}（{id}）。",
  project_manager_overlay_status_migrated: "已把 {source} 迁移到 {target}。",
  project_manager_overlay_delete_running: "正在通过 gRPC 删除项目...",
  project_manager_overlay_migrate_running: "正在通过 gRPC 迁移项目...",
  project_manager_overlay_delete_prompt_title: "输入完整项目路径以删除",
  project_manager_overlay_delete_prompt_placeholder: "输入 {path}",
  project_manager_overlay_delete_prompt_warning:
    "删除这个项目会一并删除该项目范围下绑定的 session、消息、记忆、画像和向量数据。",
  project_manager_overlay_delete_prompt_expected:
    "如果你确认继续，请准确输入完整项目路径：{path}",
  project_manager_overlay_delete_prompt_retry:
    "如果输入错误，可以在这里继续重试，或按 Esc 取消。",
  project_manager_overlay_delete_prompt_empty: "请先输入完整项目路径。",
  project_manager_overlay_delete_prompt_mismatch:
    "输入不匹配。请准确输入完整项目路径：{path}",
  project_manager_overlay_delete_effect_workspace_inherit:
    "当前工作空间项目绑定会回退到公共项目设置。",
  project_manager_overlay_delete_effect_global_replace: "公共项目设置会切换到 {value}。",
  project_manager_overlay_delete_missing_global_replacement:
    "这个项目仍然是当前公共项目。请先绑定或创建另一个项目。",
  project_manager_overlay_delete_backend_confirm_title: "确认删除项目",
  project_manager_overlay_delete_backend_confirm_message:
    "后端要求在真正删除前再做一次明确确认。现在继续吗？",
  project_manager_overlay_migrate_prompt_title: "迁移项目",
  project_manager_overlay_migrate_prompt_placeholder: "目标团队/目标空间/目标项目",
  project_manager_overlay_migrate_prompt_description:
    "输入当前选中项目要迁移到的目标 Team/Space/Project 路径。",
  project_manager_overlay_migrate_prompt_empty: "目标项目路径不能为空。",
  project_manager_overlay_migrate_confirm_input_title: "确认项目迁移",
  project_manager_overlay_migrate_confirm_input_placeholder: "输入 {value}",
  project_manager_overlay_migrate_confirm_input_warning:
    "迁移可能会重定向项目绑定，并把项目范围内的历史迁移到新目标路径。",
  project_manager_overlay_migrate_confirm_input_expected:
    "如果你确认继续，请准确输入完整迁移规格：{value}",
  project_manager_overlay_migrate_confirm_input_retry:
    "如果输入错误，可以在这里继续重试，或按 Esc 取消。",
  project_manager_overlay_migrate_confirm_input_empty: "请先输入完整迁移规格。",
  project_manager_overlay_migrate_confirm_input_mismatch:
    "输入不匹配。请准确输入完整迁移规格：{value}",
  project_manager_overlay_migrate_backend_confirm_title: "确认迁移项目",
  project_manager_overlay_migrate_backend_confirm_message:
    "后端要求在真正迁移前再做一次明确确认。现在继续吗？",
  project_manager_overlay_migrate_effect_workspace_switch:
    "当前工作空间项目绑定会切换到 {value}。",
  project_manager_overlay_migrate_effect_global_switch: "公共项目绑定会切换到 {value}。",
  project_manager_overlay_invalid_path: "请提供一条标准 Team/Space/Project 路径，且必须正好包含三个非空层级。",
  project_manager_overlay_error_invalid_path: "项目路径格式不正确。请提供一条标准 Team/Space/Project 路径。",
  project_manager_overlay_error_exists: "这个项目路径已经存在。请直接从列表里选择，或绑定已解析出的项目。",
  project_manager_overlay_error_conflict: "这个项目路径与现有层级数据冲突。请调整路径后再试。",
  project_manager_overlay_error_confirmation: "这个项目路径仍然需要显式确认后才能创建。",
  project_manager_title: "VMM 项目管理",
  project_manager_subtitle: "左侧是实时 VMM 项目列表，右侧显示详情和写入范围。",
  project_manager_section_list: "项目列表",
  project_manager_section_actions: "动作菜单",
  project_manager_section_projects: "实时项目列表",
  project_manager_details_fallback: "说明",
  project_manager_status: "状态",
  project_manager_current_project: "当前生效 project_id：{value}",
  project_manager_current_scope_project: "当前 {scope} 的 project_id：{value}",
  project_manager_loading: "正在加载项目列表...",
  project_manager_missing_grpc: "尚未配置 vulcan_host_target。",
  project_manager_loaded_projects: "已加载 {count} 个项目。",
  project_manager_item_current_subtitle: "#{id} · 当前生效项目",
  project_manager_item_scope_current_subtitle: "#{id} · 当前 {scope} 绑定",
  project_manager_item_bind_subtitle: "#{id} · 绑定到当前写入范围",
  project_manager_already_bound_in_scope: "这个项目已经绑定到当前选中的作用域（{scope}）。",
  project_manager_status_bound: "已把 {scope} 的 project_id 绑定到 {path}。",
  project_manager_status_ensuring: "正在确认项目路径“{path}”...",
  project_manager_status_created: "已创建并绑定项目：{path}。",
  project_manager_status_resolved: "已解析并绑定项目：{path}。",
  project_manager_status_cleared: "已清空 {scope} 的项目绑定。",
  project_manager_toast_title: "VMM 项目管理",
  project_manager_toast_switched: "已把 {scope} 项目切换到 {path}。",
  project_manager_keys_hint: "按键：上下选择，回车执行，Esc 返回。",
  project_manager_new_title: "新建项目路径",
  project_manager_new_subtitle: "解析或创建一个 Team/Space/Project 路径。",
  project_manager_new_detail_1: "打开输入框，输入一条标准 Team/Space/Project 路径。",
  project_manager_new_detail_2: "管理页会调用 EnsureProject，并带上 confirm_create=true。",
  project_manager_new_detail_3: "如果任一层级不存在，VMM 会先创建它，再绑定最终项目。",
  project_manager_new_prompt_title: "新建 VMM 项目路径",
  project_manager_new_prompt_placeholder: "Team/Space/Project",
  project_manager_new_prompt_description: "输入一条标准 Team/Space/Project 路径，然后回车解析或创建。",
  project_manager_new_prompt_empty: "项目路径不能为空。",
  project_manager_refresh_title: "刷新项目列表",
  project_manager_refresh_subtitle: "重新从 VMM 加载实时项目数据。",
  project_manager_refresh_detail_1: "重新从 VMM 拉取实时项目列表。",
  project_manager_refresh_detail_2: "适合在别处创建或迁移完项目，或者后端重启后重新同步。",
  project_manager_clear_title: "清空项目绑定",
  project_manager_clear_subtitle: "清空当前写入范围里的项目绑定。",
  project_manager_clear_detail_1: "移除当前写入范围里的 project_id 覆盖值。",
  project_manager_clear_detail_2: "清空后，最终生效项目可能仍然来自另一层作用域。",
  language_control_title: "VMM 语言控制",
  language_control_subtitle: "为 VMM 选择一个本地或全局界面语言覆盖值。",
  language_control_section_list: "语言列表",
  language_control_details_fallback: "说明",
  language_control_current_effective: "当前生效语言：{value}",
  language_control_write_scope: "当前写入范围：{scope}",
  language_control_status: "状态",
  language_control_toast_title: "VMM 语言控制",
  language_control_saved: "已把 {scope} 语言设置为 {value}。",
  language_control_cleared: "已清空 {scope} 语言覆盖值。",
  language_control_keys_hint: "按键：上下选择，回车应用，Esc 返回。",
  language_control_list_title: "语言列表",
  language_control_loading: "正在加载语言列表...",
  language_control_group_actions: "功能列表",
  language_control_group_languages: "语言列表",
  language_control_workspace_summary: "工作空间语言：{value}",
  language_control_global_summary: "公共设置语言：{value}",
  language_control_effective_summary: "当前生效：{value}",
  language_control_inherit_global_value: "继承全局设置",
  language_control_status_loaded: "语言数量：{count}",
  language_control_scope_dialog_title: "把这个语言保存到哪里",
  language_control_scope_workspace_title: "当前工作空间",
  language_control_scope_workspace_subtitle: "把这个语言写入当前工作空间设置。",
  language_control_scope_global_title: "公共设置",
  language_control_scope_global_subtitle: "把这个语言写入公共设置。",
  language_control_clear_title: "项目语言继承全局设置",
  language_control_clear_subtitle: "清空当前工作空间语言覆盖值，改为继承公共设置。",
  language_control_clear_detail_1: "移除当前写入范围的语言覆盖值，重新从其他层继承。",
  language_control_clear_detail_2: "命令面板里的说明仍然需要重启 OpenCode 才会刷新。",
  memory_settings_title: "Vulcan 记忆设置",
  memory_settings_subtitle: "先选择功能，再选择写入范围。",
  memory_settings_section_list: "记忆控制",
  memory_settings_loading: "正在加载记忆设置...",
  memory_settings_scope_dialog_title: "把这条记忆设置保存到哪里",
  memory_settings_scope_workspace_title: "当前工作空间",
  memory_settings_scope_workspace_subtitle: "把这条记忆设置写入当前工作空间。",
  memory_settings_scope_global_title: "公共设置",
  memory_settings_scope_global_subtitle: "把这条记忆设置写入公共设置。",
  memory_settings_toast_title: "Vulcan 记忆设置",
  memory_settings_keys_hint: "按键：上下选择，回车进入下一步，Esc/右键关闭。",
  memory_settings_inherit_value: "继承",
  memory_settings_state_pair: "项目：{project}|全局：{global}",
  memory_settings_session_compact_enabled_value: "开启",
  memory_settings_session_compact_disabled_value: "关闭",
  memory_settings_mode_adjust_title: "调整注入模式",
  memory_settings_mode_adjust_subtitle:
    "在显式注入和隐式注入之间切换。",
  memory_settings_mode_select_title: "为 {scope} 选择注入模式",
  memory_settings_mode_visible_title: "显式注入模式",
  memory_settings_mode_visible_subtitle: "先选择作用域，再把它切到显式记忆注入。",
  memory_settings_mode_visible_detail_1: "显式模式会把检索到的记忆文本直接注入到当前对话上下文中。",
  memory_settings_mode_visible_detail_2: "当你希望回忆出来的记忆对用户可见、可审阅时，适合使用它。",
  memory_settings_mode_implicit_title: "隐式注入模式",
  memory_settings_mode_implicit_subtitle: "把当前写入范围切到隐式记忆注入。",
  memory_settings_mode_implicit_detail_1: "隐式模式不会把注入文本直接展示出来，但仍会影响当前轮次。",
  memory_settings_mode_implicit_detail_2: "可以通过隐式轮数控制可复用的近期上下文范围。",
  memory_settings_turns_title: "设置隐式轮数",
  memory_settings_turns_subtitle: "先选择作用域，再编辑它的 implicit_memory_turns 值。",
  memory_settings_turns_detail_1: "打开输入框，输入一个非负整数作为 implicit_memory_turns。",
  memory_settings_turns_detail_2: "这个值决定隐式注入时会考虑多少近期轮次。",
  memory_settings_turns_prompt_title: "设置隐式轮数",
  memory_settings_turns_prompt_placeholder: "非负整数",
  memory_settings_turns_prompt_description: "输入一个非负整数，然后回车保存 implicit_memory_turns。",
  memory_settings_turns_prompt_empty: "隐式轮数不能为空。",
  memory_settings_turns_prompt_invalid: "implicit_memory_turns 必须是一个非负整数。",
  memory_settings_profile_refresh_title: "设置画像刷新轮数",
  memory_settings_profile_refresh_subtitle: "先选择作用域，再编辑它的 profile_refresh_turns 值。",
  memory_settings_profile_refresh_detail_1:
    "打开输入框，输入一个非负整数作为 profile_refresh_turns。",
  memory_settings_profile_refresh_detail_2:
    "这个值决定成功提交多少条 turn 后会重新拉取完整画像 bundle。",
  memory_settings_profile_refresh_prompt_title: "设置画像刷新轮数",
  memory_settings_profile_refresh_prompt_placeholder: "非负整数",
  memory_settings_profile_refresh_prompt_description:
    "输入一个非负整数，然后回车保存 profile_refresh_turns。",
  memory_settings_profile_refresh_prompt_empty: "画像刷新轮数不能为空。",
  memory_settings_profile_refresh_prompt_invalid:
    "profile_refresh_turns 必须是一个非负整数。",
  memory_settings_session_compact_adjust_title: "调整压缩感知召回",
  memory_settings_session_compact_adjust_subtitle:
    "控制 compact-aware recall 与 compact 通知。",
  memory_settings_session_compact_select_title:
    "为 {scope} 选择压缩感知召回模式",
  memory_settings_session_compact_on_title: "开启压缩感知召回",
  memory_settings_session_compact_on_subtitle:
    "先选择作用域，再开启 compact-aware recall 与 compact 通知。",
  memory_settings_session_compact_on_detail_1:
    "开启后，PreCheck 会使用 session compact recall mode，compact hook 也会发送 ChatCompact 确认。",
  memory_settings_session_compact_on_detail_2:
    "适合在当前工作区启用“压缩后不要重新召回未压缩尾部”的行为。",
  memory_settings_session_compact_off_title: "关闭压缩感知召回",
  memory_settings_session_compact_off_subtitle:
    "先选择作用域，再回退到 legacy PreCheck 召回，并停止 compact 通知。",
  memory_settings_session_compact_off_detail_1:
    "关闭后，compact hook 不再通知 VMM，PreCheck 也会继续使用 legacy recall mode。",
  memory_settings_session_compact_off_detail_2:
    "只在当前宿主或工作流不适合参与 compact-aware recall 时关闭它。",
  memory_settings_saved_visible: "已把 {scope} 切换到显式注入模式。",
  memory_settings_saved_implicit: "已把 {scope} 切换到隐式注入模式。",
  memory_settings_saved_turns: "已把 {scope} 隐式轮数设置为 {value}。",
  memory_settings_saved_profile_refresh: "已把 {scope} 画像刷新轮数设置为 {value}。",
  memory_settings_saved_session_compact_on: "已为 {scope} 开启压缩感知召回。",
  memory_settings_saved_session_compact_off: "已为 {scope} 关闭压缩感知召回。",
  grpc_transport_section_list: "gRPC 传输控制",
  grpc_transport_loading: "正在加载 gRPC 传输设置...",
  grpc_transport_scope_dialog_title: "把这条 gRPC 传输设置保存到哪里",
  grpc_transport_scope_workspace_subtitle:
    "把这条 gRPC 传输设置写入当前工作空间。",
  grpc_transport_scope_global_subtitle:
    "把这条 gRPC 传输设置写入公共设置。",
  grpc_transport_toast_title: "gRPC 传输设置",
  grpc_transport_vulcan_host_target_title: "设置 Vulcan Host 地址",
  grpc_transport_vulcan_host_target_subtitle:
    "VMM、LuaSkills 与未来宿主服务使用的插件侧唯一中转端点。",
  grpc_transport_endpoint_plan_summary:
    "计划：{mode}；生效={effective}",
  grpc_transport_endpoint_prompt_placeholder: "host:port 或 ${ENV_NAME}；留空表示继承",
  grpc_transport_endpoint_prompt_description:
    "输入一个不含空白字符的 gRPC target。留空会清空当前作用域并恢复继承。",
  grpc_transport_endpoint_prompt_invalid:
    "Endpoint target 必须为空，或是一个不含空白字符的 gRPC target。",
  grpc_transport_vulcan_host_target_prompt_title: "设置 vulcan_host_target",
  grpc_transport_saved_vulcan_host_target:
    "已将 {scope} 的 vulcan_host_target 保存为 {value}。",
  grpc_transport_keepalive_time_title: "设置 Keepalive 时间",
  grpc_transport_keepalive_time_subtitle:
    "先选择作用域，再编辑 grpc_keepalive_time_ms。",
  grpc_transport_keepalive_timeout_title: "设置 Keepalive 超时",
  grpc_transport_keepalive_timeout_subtitle:
    "先选择作用域，再编辑 grpc_keepalive_timeout_ms。",
  grpc_transport_permit_title: "调整空闲期 Keepalive 策略",
  grpc_transport_permit_subtitle:
    "先选择作用域，再切换 grpc_keepalive_permit_without_calls。",
  grpc_transport_save_failed:
    "保存 gRPC 传输设置失败。请重试。",
  grpc_transport_keepalive_time_prompt_title: "设置 Keepalive 时间 (ms)",
  grpc_transport_keepalive_time_prompt_placeholder: "正整数毫秒值",
  grpc_transport_keepalive_time_prompt_description:
    "输入 grpc_keepalive_time_ms。它决定空闲连接多久发送一次 keepalive ping。",
  grpc_transport_keepalive_time_prompt_empty: "keepalive 时间不能为空。",
  grpc_transport_keepalive_time_prompt_invalid:
    "grpc_keepalive_time_ms 必须是大于 0 的整数。",
  grpc_transport_keepalive_timeout_prompt_title: "设置 Keepalive 超时 (ms)",
  grpc_transport_keepalive_timeout_prompt_placeholder: "正整数毫秒值",
  grpc_transport_keepalive_timeout_prompt_description:
    "输入 grpc_keepalive_timeout_ms。它决定一次 keepalive 等待 ACK 的超时预算。",
  grpc_transport_keepalive_timeout_prompt_empty: "keepalive 超时不能为空。",
  grpc_transport_keepalive_timeout_prompt_invalid:
    "grpc_keepalive_timeout_ms 必须是大于 0 的整数。",
  grpc_transport_keepalive_timeout_exceeds_time:
    "keepalive 超时时间必须小于 keepalive 间隔时间。",
  grpc_transport_keepalive_time_below_timeout:
    "keepalive 间隔时间不能小于当前超时时间。",
  grpc_transport_permit_select_title: "为 {scope} 选择空闲期 keepalive 策略",
  grpc_transport_permit_disabled_title: "禁止无调用 keepalive",
  grpc_transport_permit_disabled_subtitle:
    "只有存在活动 RPC 时才允许发送 keepalive ping。",
  grpc_transport_permit_enabled_title: "允许无调用 keepalive",
  grpc_transport_permit_enabled_subtitle:
    "即使当前没有活动 RPC，也允许发送 keepalive ping。",
  grpc_transport_saved_keepalive_time:
    "已把 {scope} keepalive 时间设置为 {value} ms。",
  grpc_transport_saved_keepalive_timeout:
    "已把 {scope} keepalive 超时设置为 {value} ms。",
  grpc_transport_saved_permit_on:
    "已为 {scope} 开启无调用 keepalive。",
  grpc_transport_saved_permit_off:
    "已为 {scope} 关闭无调用 keepalive。",
  profile_center_title: "VMM 画像中心",
  profile_center_subtitle: "选择画像目标、查看节点，或追加一条手工画像指令。",
  profile_center_section_list: "画像项",
  profile_center_section_targets: "画像目标",
  profile_center_section_actions: "动作菜单",
  profile_center_section_nodes: "已有画像表格",
  profile_center_details_fallback: "说明",
  profile_center_current_target: "当前画像目标：{value}",
  profile_center_status: "状态",
  profile_target_selected_subtitle: "{value} 是当前画像目标。",
  profile_target_switch_subtitle: "切换当前画像目标到 {value}。",
  profile_center_loading: "正在加载画像节点...",
  profile_center_no_binding_user: "打开 user 画像目标前，需要先有一个有效的 user_id。",
  profile_center_no_binding_project: "打开这个画像目标前，需要先有一个有效的 project_id。",
  profile_center_no_nodes: "当前目标没有返回 active 画像节点。",
  profile_center_loaded_nodes: "已加载 {count} 个 active 画像节点。",
  profile_center_applying: "正在应用一条手工画像指令...",
  profile_center_toast_title: "VMM 画像中心",
  profile_center_keys_hint: "按键：上下选择，回车执行，Esc 返回。",
  profile_center_refresh_title: "刷新画像节点",
  profile_center_refresh_subtitle: "重新加载当前目标的 active 节点。",
  profile_center_refresh_detail_1: "按后端允许的最大切片，重新拉取当前画像目标。",
  profile_center_refresh_detail_2: "适合在手工编辑之后，或者怀疑后端数据变化时重新同步。",
  profile_center_add_title: "追加手工指令",
  profile_center_add_subtitle: "向当前画像目标写入一条手工画像指令。",
  profile_center_add_detail_1: "打开输入框，输入一条自然语言画像指令。",
  profile_center_add_detail_2: "后端会同步评审这条指令，接纳新节点并退役旧节点。",
  profile_center_add_detail_3: "team 和 space 画像写入在这里会额外经过一次确认，因为它们属于更高权威规则。",
  profile_center_add_prompt_title: "手工画像指令",
  profile_center_add_prompt_placeholder: "自然语言指令",
  profile_center_add_prompt_description: "描述你希望 VMM 长期保留的画像事实或偏好。",
  profile_center_add_prompt_empty: "画像指令不能为空。",
  profile_center_confirm_title: "确认高权威画像更新",
  profile_center_confirm_message: "这个目标会写入更广范围、更高权威的画像规则。确认继续吗？",
  profile_center_applied: "画像指令已应用。本次接纳 {accepted} 条节点，退役 {retired} 条。",
  profile_center_launcher_title: "画像中心",
  profile_center_launcher_subtitle: "先选择一个画像目标，再进入对应的画像工作区。",
  profile_center_launcher_hint: "按键：上下选择目标，回车进入，Esc/右键返回。",
  profile_center_launcher_status_idle: "请选择一个画像目标开始。",
  profile_bundle_test_title: "完整画像测试",
  profile_bundle_test_section_actions: "动作菜单",
  profile_bundle_test_section_bundle: "完整画像 Bundle",
  profile_bundle_test_refresh_title: "获取完整画像",
  profile_bundle_test_refresh_subtitle: "按当前 user/project 绑定重新拉取 FULL bundle。",
  profile_bundle_test_loading: "正在加载完整画像 bundle...",
  profile_bundle_test_missing_scope:
    "完整画像 bundle 需要同时存在当前 user_id 和 project_id 绑定。",
  profile_bundle_test_status_idle: "按回车即可重新加载当前完整画像 bundle。",
  profile_bundle_test_status_loaded: "已加载完整画像文本（{count} 字符）。",
  profile_bundle_test_empty: "当前还没有完整画像文本。",
  profile_bundle_test_keys_hint: "按键：回车刷新，Esc/右键返回。",
  tools_debug_title: "VMM Tools 调试",
  tools_debug_section_actions: "动作菜单",
  tools_debug_section_request: "最近请求",
  tools_debug_section_response: "最近响应",
  tools_debug_status_idle: "先选择一个动作，再开始测试当前 gRPC 接口。",
  tools_debug_loading: "正在执行 {label}...",
  tools_debug_missing_grpc: "尚未配置 vulcan_host_target。",
  tools_debug_missing_scope: "这条动作需要同时存在当前 user_id 和 project_id 绑定。",
  tools_debug_request_empty: "当前还没有执行过请求。",
  tools_debug_response_empty: "当前还没有可展示的响应。",
  tools_debug_keys_hint: "按键：上下选择，回车执行，Esc/右键返回。",
  tools_debug_action_healthz_title: "Healthz",
  tools_debug_action_healthz_subtitle: "不依赖业务作用域，先测试传输链是否可达。",
  tools_debug_action_search_memory_title: "搜索记忆",
  tools_debug_action_search_memory_subtitle: "按当前绑定执行一条简单查询版主动记忆搜索。",
  tools_debug_action_turn_details_title: "Turn 详情",
  tools_debug_action_turn_details_subtitle: "按精确 turn id 读取结构化来源 turn 详情。",
  tools_debug_action_write_memories_title: "主动写记忆",
  tools_debug_action_write_memories_subtitle:
    "按面向 AI 的真实字段填写一条主动记忆，并写入当前绑定范围。",
  tools_debug_search_prompt_title: "搜索查询内容",
  tools_debug_search_prompt_placeholder:
    "汽车偏好\n并发方案决策",
  tools_debug_search_prompt_description:
    "每行输入一条完整查询。由于逗号本身可能属于查询内容，这里不再按逗号拆分。新版接口不再使用“背景 => 查询”结构。",
  tools_debug_search_prompt_empty: "搜索查询不能为空。",
  tools_debug_search_prompt_invalid:
    "请至少输入一条非空查询，并保持每行一条。",
  tools_debug_search_topk_prompt_title: "搜索 TopK",
  tools_debug_search_topk_prompt_placeholder: "正整数",
  tools_debug_search_topk_prompt_description: "输入一个 top_k 正整数，然后回车。",
  tools_debug_search_topk_prompt_empty: "top_k 不能为空。",
  tools_debug_search_topk_prompt_invalid: "top_k 必须是正整数。",
  tools_debug_turn_prompt_title: "Turn 详情 IDs",
  tools_debug_turn_prompt_placeholder: "1\n2",
  tools_debug_turn_prompt_description:
    "每行输入一个 source_turn_id，或使用逗号分隔后确认。请优先使用 SearchMemoryEvents 返回且不为 0 的 source_turn_id。",
  tools_debug_turn_prompt_empty: "turn id 列表不能为空。",
  tools_debug_turn_prompt_invalid:
    "请逐行输入正整数，或使用逗号分隔的正整数列表，例如 1,2。",
  tools_debug_write_prompt_title: "写记忆字段",
  tools_debug_write_prompt_placeholder: "填写当前必填字段",
  tools_debug_write_prompt_description:
    "按步骤填写写记忆字段。新版接口里 abstract、details 和 category 都是必填。",
  tools_debug_write_prompt_empty: "当前写记忆字段不能为空。",
  tools_debug_write_prompt_invalid:
    "请为当前写记忆字段提供一个合法且非空的值。",
  tools_debug_write_abstract_prompt_title: "记忆摘要",
  tools_debug_write_abstract_prompt_placeholder: "描述要长期保留的稳定事实",
  tools_debug_write_abstract_prompt_description:
    "输入这条主动记忆的摘要内容。这个字段必填。",
  tools_debug_write_details_prompt_title: "记忆详情",
  tools_debug_write_details_prompt_placeholder: "完整的长期记忆正文",
  tools_debug_write_details_prompt_description:
    "输入完整的长期记忆正文。新版接口要求这个字段必填。",
  tools_debug_write_scope_prompt_title: "记忆作用域",
  tools_debug_write_scope_prompt_description:
    "选择这条记忆应该归属于哪个作用域层级。",
  tools_debug_write_scope_session_title: "Session 作用域",
  tools_debug_write_scope_session_subtitle:
    "把记忆保留在当前 session 级别，适合更窄、更临时的复用。",
  tools_debug_write_scope_project_title: "Project 作用域",
  tools_debug_write_scope_project_subtitle:
    "把记忆共享给当前项目绑定；这是最常见的默认选择。",
  tools_debug_write_scope_user_title: "User 作用域",
  tools_debug_write_scope_user_subtitle:
    "让当前绑定用户跨项目复用这条记忆。",
  tools_debug_write_priority_prompt_title: "记忆优先级",
  tools_debug_write_priority_prompt_description:
    "选择后端应当如何强调这条记忆的重要程度。",
  tools_debug_write_priority_p0_title: "P0",
  tools_debug_write_priority_p0_subtitle: "最高优先级，适合最稳定、最重要的记忆。",
  tools_debug_write_priority_p1_title: "P1",
  tools_debug_write_priority_p1_subtitle:
    "默认优先级，适合普通但稳定的长期记忆。",
  tools_debug_write_priority_p2_title: "P2",
  tools_debug_write_priority_p2_subtitle:
    "较低优先级，适合较弱或仍在观察中的记忆。",
  tools_debug_write_level_prompt_title: "记忆层级",
  tools_debug_write_level_prompt_description:
    "选择这次主动写入要落到后端的哪一层记忆层级。",
  tools_debug_write_level_l0_title: "L0",
  tools_debug_write_level_l0_subtitle: "最短期、最局部的记忆层级。",
  tools_debug_write_level_l1_title: "L1",
  tools_debug_write_level_l1_subtitle:
    "最常用的默认长期层级，适合普通主动写记忆。",
  tools_debug_write_level_l2_title: "L2",
  tools_debug_write_level_l2_subtitle:
    "更高阶的长期层级，适合更强的长期召回。",
  tools_debug_write_level_l3_title: "L3",
  tools_debug_write_level_l3_subtitle:
    "最高长期层级，适合最强保留需求的记忆。",
  tools_debug_write_category_prompt_title: "记忆分类编号",
  tools_debug_write_category_prompt_placeholder: "必填整数 0-7",
  tools_debug_write_category_prompt_description:
    "输入必填的 category 整数编号。0=general，1=architecture_decision，2=tech_spec_api，3=business_logic，4=requirement_todo，5=project_context，6=logical_bug_debt，7=security_policy。",
  tools_debug_write_category_prompt_invalid:
    "category 必须是 0 到 7 之间的整数。",
  profile_center_workspace_header: "{value}画像工作区",
  profile_center_workspace_hint:
    "按键：左右切动作，上下切节点，回车查看或执行，Esc/右键返回。",
  profile_center_filter_placeholder: "按内容、来源、编号或日期过滤画像节点...",
  profile_center_details_title: "画像节点详情",
  profile_center_details_hint: "先在上方节点表格里选中一条，再在下方查看完整详情表。",
  profile_center_details_meta_title: "结构化字段",
  profile_center_details_story_title: "画像详情与层级原因",
  profile_workspace_action_add_subtitle: "基于当前目标和当前节点上下文，追加一条手工画像指令。",
  profile_workspace_action_refresh_subtitle: "从后端重新加载当前目标的 active 节点。",
  profile_target_user_launcher: "用户画像",
  profile_target_project_launcher: "项目画像",
  profile_target_space_launcher: "空间画像",
  profile_target_team_launcher: "团队画像",
  profile_detail_field_key: "字段",
  profile_detail_field_value: "内容",
  profile_detail_field_node_id: "节点 ID",
  profile_detail_field_target: "画像目标",
  profile_detail_field_bind_id: "绑定 ID",
  profile_detail_field_plw: "P/L/W",
  profile_detail_field_priority: "优先级",
  profile_detail_field_level: "层级",
  profile_detail_field_refresh_weight: "刷新权重",
  profile_detail_field_profile_date: "画像日期",
  profile_detail_field_expires: "到期日期",
  profile_detail_field_source: "来源",
  profile_detail_field_source_id: "来源 ID",
  profile_detail_field_content: "详细内容",
  profile_detail_field_reason: "为什么 / 层级原因",
  profile_target_user: "用户",
  profile_target_project: "项目",
  profile_target_team: "团队",
  profile_target_space: "空间",
  profile_node_scope: "归属层级",
  profile_node_source: "来源",
  profile_node_expires: "到期日期",
  profile_node_reason: "层级原因",
  profile_node_plw: "P/L/W",
  profile_table_id: "#ID",
  profile_table_scope: "目标",
  profile_table_plw: "P/L/W",
  profile_table_profile_date: "画像日期",
  profile_table_expires: "到期日期",
  profile_table_source: "来源",
  profile_table_content: "内容",
  scope_local_title: "写入范围：本地",
  scope_global_title: "写入范围：全局",
  scope_selected_subtitle: "{scope} 是当前写入范围。",
  scope_switch_subtitle: "把当前写入范围切换到 {scope}。",
  scope_detail_selected: "{scope} 已经是当前写入范围。",
  scope_detail_switch: "后续一次修改会写入到 {scope}。",
  back_setting_title: "返回控制面板",
  back_setting_subtitle: "回到功能列表。",
  back_setting_detail_1: "返回顶层设置中心。",
  back_setting_detail_2: "这样可以保持当前 user 工作流是“列表优先、窗口化”的模式。",
  new_user_dialog_title: "新建 VMM 用户",
  new_user_dialog_placeholder: "输入用户名",
  new_user_dialog_description: "输入一个用户名，然后回车解析或创建，并把它本地绑定。",
  new_user_dialog_empty: "用户名不能为空。",
  summary_ok: "{label}：成功",
  summary_handshake_timeout: "{label}：握手超时",
  summary_receive_timeout: "{label}：接收超时",
  summary_failed: "{label}：失败",
}

/**
 * Shared compact translations for the other supported TUI languages.
 * 其余受支持 TUI 语言共用的精简翻译目录。
 *
 * These catalogs intentionally keep the wording concise because terminal UI
 * space is narrow and long text causes wrapping noise faster than in chat.
 * 这些目录刻意把文案保持得更紧凑，因为终端界面可用空间很窄，
 * 比起聊天窗口，它更容易被长文本撑坏布局。
 */
const VMM_TUI_CATALOGS_COMPACT: Record<Exclude<VmmLanguage, "en" | "zh-CN">, VmmTuiCatalog> = {
  es: {
    ...VMM_TUI_CATALOG_EN,
    command_title: "Panel de control Vulcan",
    command_description: "Abrir el panel de control de Vulcan",
    mounted_entry_label: "Panel de control Vulcan",
    setting_title: "Panel de control Vulcan",
    setting_subtitle: "Configura Vulcan desde una ventana TUI dedicada, sin respuestas del asistente.",
    setting_section_functions: "Funciones",
    setting_section_details: "Detalles",
    setting_keys_hint: "Teclas: Arriba/Abajo para seleccionar, Enter para abrir, Esc para salir.",
    setting_current_language: "Idioma actual de la interfaz: {language}",
    setting_menu_user_manager_title: "Gestor de usuarios",
    setting_menu_user_manager_subtitle: "Listar, crear y cambiar usuarios VMM.",
    user_manager_title: "Gestor de usuarios VMM",
    user_manager_subtitle: "Usuarios VMM en vivo a la izquierda. Detalles y acciones a la derecha.",
    user_manager_section_list: "Lista de usuarios",
    user_manager_section_actions: "Acciones",
    user_manager_section_users: "Usuarios en vivo",
    user_manager_details_fallback: "Detalles",
    user_manager_status: "Estado",
    user_manager_current_user: "user_id efectivo actual: {value}",
    user_manager_unset: "(sin definir)",
    user_manager_bind_scope: "Ámbito de escritura actual: {scope}",
    user_manager_loading: "Cargando lista de usuarios...",
    user_manager_missing_grpc: "vulcan_host_target aún no está configurado.",
    user_manager_loaded_users: "{count} usuarios cargados.",
    user_manager_item_current_subtitle: "#{id} · usuario efectivo actual",
    user_manager_item_bind_subtitle: "#{id} · enlazar en {scope}",
    user_manager_status_bound_local: "user_id de {scope} enlazado a {name} (#{id}).",
    user_manager_status_resolving: "Resolviendo usuario \"{name}\"...",
    user_manager_status_created: "Usuario creado: {name} (#{id}).",
    user_manager_status_resolved: "Usuario resuelto: {name} (#{id}).",
    user_manager_status_switched: "Usuario de {scope} cambiado a {name} (#{id}).",
    user_manager_no_selectable: "No hay elementos seleccionables en el gestor de usuarios.",
    user_manager_selected_user: "Usuario seleccionado: {name}",
    user_manager_selected_user_id: "ID de usuario: {id}",
    user_manager_already_bound: "Este usuario ya es el enlace efectivo actual.",
    user_manager_press_bind: "Pulsa Enter o haz clic para enlazar este usuario en {scope}.",
    user_manager_scope_note: "El ámbito de escritura seleccionado es {scope}.",
    user_manager_toast_title: "Gestor de usuarios VMM",
    user_manager_toast_switched: "Usuario de {scope} cambiado a {name} (#{id}).",
    user_manager_keys_hint:
      "Teclas: Arriba/Abajo para seleccionar, Enter para actuar, Esc para volver.",
    user_manager_new_user_title: "Nuevo usuario",
    user_manager_new_user_subtitle: "Resolver o crear un usuario por nombre.",
    user_manager_refresh_title: "Actualizar lista",
    user_manager_refresh_subtitle: "Recargar datos en vivo desde VMM.",
    back_setting_title: "Volver al panel",
    back_setting_subtitle: "Volver a la lista de funciones.",
    new_user_dialog_title: "Nuevo usuario VMM",
    new_user_dialog_placeholder: "Nombre del usuario",
    new_user_dialog_description:
      "Escribe un nombre y pulsa Enter para resolverlo o crearlo y enlazarlo localmente.",
    new_user_dialog_empty: "El nombre del usuario no puede estar vacío.",
    summary_ok: "{label}: correcto",
    summary_handshake_timeout: "{label}: tiempo de espera en handshake",
    summary_receive_timeout: "{label}: tiempo de espera en respuesta",
    summary_failed: "{label}: fallo",
  },
  fr: {
    ...VMM_TUI_CATALOG_EN,
    command_title: "Panneau de contrôle Vulcan",
    command_description: "Ouvrir le panneau de contrôle Vulcan",
    mounted_entry_label: "Panneau de contrôle Vulcan",
    setting_title: "Panneau de contrôle Vulcan",
    setting_subtitle: "Configure Vulcan depuis une fenêtre TUI dédiée, sans réponse d'assistant.",
    setting_section_functions: "Fonctions",
    setting_section_details: "Détails",
    setting_keys_hint: "Touches : Haut/Bas pour choisir, Entrée pour ouvrir, Échap pour quitter.",
    setting_current_language: "Langue actuelle de l'interface : {language}",
    setting_menu_user_manager_title: "Gestion des utilisateurs",
    setting_menu_user_manager_subtitle: "Lister, créer et changer les utilisateurs VMM.",
    user_manager_title: "Gestionnaire d'utilisateurs VMM",
    user_manager_subtitle: "Utilisateurs VMM en direct à gauche, détails et action à droite.",
    user_manager_section_list: "Liste des utilisateurs",
    user_manager_section_actions: "Actions",
    user_manager_section_users: "Utilisateurs live",
    user_manager_details_fallback: "Détails",
    user_manager_status: "Statut",
    user_manager_current_user: "user_id effectif actuel : {value}",
    user_manager_unset: "(non défini)",
    user_manager_bind_scope: "Portée d'écriture actuelle : {scope}",
    user_manager_loading: "Chargement de la liste des utilisateurs...",
    user_manager_missing_grpc: "vulcan_host_target n'est pas encore configuré.",
    user_manager_loaded_users: "{count} utilisateurs chargés.",
    user_manager_item_current_subtitle: "#{id} · utilisateur effectif actuel",
    user_manager_item_bind_subtitle: "#{id} · lier dans {scope}",
    user_manager_status_bound_local: "user_id de {scope} lié à {name} (#{id}).",
    user_manager_status_resolving: "Résolution de l'utilisateur « {name} »...",
    user_manager_status_created: "Utilisateur créé : {name} (#{id}).",
    user_manager_status_resolved: "Utilisateur résolu : {name} (#{id}).",
    user_manager_status_switched: "Utilisateur de {scope} changé vers {name} (#{id}).",
    user_manager_no_selectable: "Aucun élément sélectionnable dans le gestionnaire d'utilisateurs.",
    user_manager_selected_user: "Utilisateur sélectionné : {name}",
    user_manager_selected_user_id: "ID utilisateur : {id}",
    user_manager_already_bound: "Cet utilisateur est déjà la liaison effective actuelle.",
    user_manager_press_bind: "Appuie sur Entrée ou clique pour lier cet utilisateur dans {scope}.",
    user_manager_scope_note: "La portée d'écriture sélectionnée est {scope}.",
    user_manager_toast_title: "Gestionnaire d'utilisateurs VMM",
    user_manager_toast_switched: "Utilisateur de {scope} changé vers {name} (#{id}).",
    user_manager_keys_hint:
      "Touches : Haut/Bas pour choisir, Entrée pour agir, Échap pour revenir.",
    user_manager_new_user_title: "Nouvel utilisateur",
    user_manager_new_user_subtitle: "Résoudre ou créer un utilisateur par nom.",
    user_manager_refresh_title: "Rafraîchir la liste",
    user_manager_refresh_subtitle: "Recharger les données en direct depuis VMM.",
    back_setting_title: "Retour au panneau",
    back_setting_subtitle: "Revenir à la liste des fonctions.",
    new_user_dialog_title: "Nouvel utilisateur VMM",
    new_user_dialog_placeholder: "Nom de l'utilisateur",
    new_user_dialog_description:
      "Saisis un nom puis appuie sur Entrée pour le résoudre ou le créer et le lier localement.",
    new_user_dialog_empty: "Le nom d'utilisateur ne peut pas être vide.",
    summary_ok: "{label} : ok",
    summary_handshake_timeout: "{label} : délai de handshake",
    summary_receive_timeout: "{label} : délai de réponse",
    summary_failed: "{label} : échec",
  },
  de: {
    ...VMM_TUI_CATALOG_EN,
    command_title: "Vulcan-Kontrollpanel",
    command_description: "Das Vulcan-Kontrollpanel öffnen",
    mounted_entry_label: "Vulcan-Kontrollpanel",
    setting_title: "Vulcan-Kontrollpanel",
    setting_subtitle:
      "VMM in einem eigenen TUI-Fenster konfigurieren, statt Assistentenantworten zu erzeugen.",
    setting_section_functions: "Funktionen",
    setting_section_details: "Details",
    setting_keys_hint: "Tasten: Hoch/Runter wählen, Enter öffnen, Esc verlassen.",
    setting_current_language: "Aktuelle UI-Sprache: {language}",
    setting_menu_user_manager_title: "Benutzerverwaltung",
    setting_menu_user_manager_subtitle: "VMM-Benutzer auflisten, erstellen und wechseln.",
    user_manager_title: "VMM-Benutzerverwaltung",
    user_manager_subtitle: "Live-VMM-Benutzer links, Details und Aktion rechts.",
    user_manager_section_list: "Benutzerliste",
    user_manager_section_actions: "Aktionen",
    user_manager_section_users: "Live-Benutzer",
    user_manager_details_fallback: "Details",
    user_manager_status: "Status",
    user_manager_current_user: "Aktuelle effektive user_id: {value}",
    user_manager_unset: "(nicht gesetzt)",
    user_manager_bind_scope: "Aktueller Schreibbereich: {scope}",
    user_manager_loading: "Benutzerliste wird geladen...",
    user_manager_missing_grpc: "vulcan_host_target ist noch nicht konfiguriert.",
    user_manager_loaded_users: "{count} Benutzer geladen.",
    user_manager_item_current_subtitle: "#{id} · aktueller effektiver Benutzer",
    user_manager_item_bind_subtitle: "#{id} · in {scope} binden",
    user_manager_status_bound_local: "{scope}-user_id an {name} (#{id}) gebunden.",
    user_manager_status_resolving: "Benutzer „{name}“ wird aufgelöst...",
    user_manager_status_created: "Benutzer erstellt: {name} (#{id}).",
    user_manager_status_resolved: "Benutzer aufgelöst: {name} (#{id}).",
    user_manager_status_switched: "{scope}-Benutzer auf {name} (#{id}) umgestellt.",
    user_manager_no_selectable: "Derzeit ist kein wählbarer Eintrag vorhanden.",
    user_manager_selected_user: "Ausgewählter Benutzer: {name}",
    user_manager_selected_user_id: "Benutzer-ID: {id}",
    user_manager_already_bound: "Dieser Benutzer ist bereits die aktuelle effektive Bindung.",
    user_manager_press_bind: "Enter drücken oder klicken, um diesen Benutzer in {scope} zu binden.",
    user_manager_scope_note: "Der ausgewählte Schreibbereich ist {scope}.",
    user_manager_toast_title: "VMM-Benutzerverwaltung",
    user_manager_toast_switched: "{scope}-Benutzer auf {name} (#{id}) umgestellt.",
    user_manager_keys_hint:
      "Tasten: Hoch/Runter wählen, Enter ausführen, Esc zurück.",
    user_manager_new_user_title: "Neuer Benutzer",
    user_manager_new_user_subtitle: "Benutzer per Name auflösen oder erstellen.",
    user_manager_refresh_title: "Liste aktualisieren",
    user_manager_refresh_subtitle: "Live-Daten erneut aus VMM laden.",
    back_setting_title: "Zurück zum Kontrollpanel",
    back_setting_subtitle: "Zur Funktionsliste zurückkehren.",
    new_user_dialog_title: "Neuer VMM-Benutzer",
    new_user_dialog_placeholder: "Benutzername",
    new_user_dialog_description:
      "Benutzernamen eingeben und Enter drücken, um ihn aufzulösen oder zu erstellen und lokal zu binden.",
    new_user_dialog_empty: "Der Benutzername darf nicht leer sein.",
    summary_ok: "{label}: ok",
    summary_handshake_timeout: "{label}: Handshake-Timeout",
    summary_receive_timeout: "{label}: Antwort-Timeout",
    summary_failed: "{label}: fehlgeschlagen",
  },
  ja: {
    ...VMM_TUI_CATALOG_EN,
    command_title: "Vulcan コントロールパネル",
    command_description: "Vulcan コントロールパネルを開く",
    mounted_entry_label: "Vulcan コントロールパネル",
    setting_title: "Vulcan コントロールパネル",
    setting_subtitle: "アシスタント返信ではなく、専用 TUI ウィンドウで Vulcan を設定します。",
    setting_section_functions: "機能",
    setting_section_details: "詳細",
    setting_keys_hint: "キー: 上下で選択、Enter で開く、Esc で戻る。",
    setting_current_language: "現在の UI 言語: {language}",
    setting_menu_user_manager_title: "ユーザー管理",
    setting_menu_user_manager_subtitle: "VMM ユーザーの一覧、作成、切り替え。",
    user_manager_title: "VMM ユーザー管理",
    user_manager_subtitle: "左に live ユーザー一覧、右に詳細と操作ヒントを表示します。",
    user_manager_section_list: "ユーザー一覧",
    user_manager_section_actions: "操作",
    user_manager_section_users: "live ユーザー",
    user_manager_details_fallback: "詳細",
    user_manager_status: "状態",
    user_manager_current_user: "現在有効な user_id: {value}",
    user_manager_unset: "(未設定)",
    user_manager_bind_scope: "現在の書き込み範囲: {scope}",
    user_manager_loading: "ユーザー一覧を読み込み中...",
    user_manager_missing_grpc: "vulcan_host_target がまだ設定されていません。",
    user_manager_loaded_users: "{count} 件のユーザーを読み込みました。",
    user_manager_item_current_subtitle: "#{id} · 現在有効なユーザー",
    user_manager_item_bind_subtitle: "#{id} · {scope} にバインド",
    user_manager_status_bound_local: "{scope} の user_id を {name} (#{id}) にバインドしました。",
    user_manager_status_resolving: "ユーザー「{name}」を解決中...",
    user_manager_status_created: "ユーザーを作成しました: {name} (#{id})。",
    user_manager_status_resolved: "ユーザーを解決しました: {name} (#{id})。",
    user_manager_status_switched: "{scope} ユーザーを {name} (#{id}) に切り替えました。",
    user_manager_no_selectable: "現在選択できる user-manager 項目がありません。",
    user_manager_selected_user: "選択中のユーザー: {name}",
    user_manager_selected_user_id: "ユーザー ID: {id}",
    user_manager_already_bound: "このユーザーはすでに現在の有効バインドです。",
    user_manager_press_bind: "Enter またはクリックでこのユーザーを {scope} にバインドします。",
    user_manager_scope_note: "現在選択されている書き込み範囲は {scope} です。",
    user_manager_toast_title: "VMM ユーザー管理",
    user_manager_toast_switched: "{scope} ユーザーを {name} (#{id}) に切り替えました。",
    user_manager_keys_hint:
      "キー: 上下で選択、Enter で実行、Esc で戻る。",
    user_manager_new_user_title: "新規ユーザー",
    user_manager_new_user_subtitle: "名前でユーザーを解決または作成します。",
    user_manager_refresh_title: "一覧を更新",
    user_manager_refresh_subtitle: "VMM から live データを再読み込みします。",
    back_setting_title: "コントロールパネルへ戻る",
    back_setting_subtitle: "機能一覧に戻ります。",
    new_user_dialog_title: "新しい VMM ユーザー",
    new_user_dialog_placeholder: "ユーザー名",
    new_user_dialog_description:
      "ユーザー名を入力して Enter を押すと、解決または作成してローカルにバインドします。",
    new_user_dialog_empty: "ユーザー名は空にできません。",
    summary_ok: "{label}: 成功",
    summary_handshake_timeout: "{label}: ハンドシェイクがタイムアウトしました",
    summary_receive_timeout: "{label}: 応答がタイムアウトしました",
    summary_failed: "{label}: 失敗",
  },
  ko: {
    ...VMM_TUI_CATALOG_EN,
    command_title: "Vulcan 제어 패널",
    command_description: "Vulcan 제어 패널 열기",
    mounted_entry_label: "Vulcan 제어 패널",
    setting_title: "Vulcan 제어 패널",
    setting_subtitle: "도우미 응답 대신 전용 TUI 창에서 Vulcan 을 설정합니다.",
    setting_section_functions: "기능",
    setting_section_details: "상세",
    setting_keys_hint: "키: 위/아래 선택, Enter 열기, Esc 나가기.",
    setting_current_language: "현재 UI 언어: {language}",
    setting_menu_user_manager_title: "사용자 관리자",
    setting_menu_user_manager_subtitle: "VMM 사용자 목록, 생성, 전환.",
    user_manager_title: "VMM 사용자 관리자",
    user_manager_subtitle: "왼쪽은 live 사용자 목록, 오른쪽은 상세와 동작 힌트입니다.",
    user_manager_section_list: "사용자 목록",
    user_manager_section_actions: "동작",
    user_manager_section_users: "live 사용자",
    user_manager_details_fallback: "상세",
    user_manager_status: "상태",
    user_manager_current_user: "현재 유효한 user_id: {value}",
    user_manager_unset: "(설정 안 됨)",
    user_manager_bind_scope: "현재 쓰기 범위: {scope}",
    user_manager_loading: "사용자 목록을 불러오는 중...",
    user_manager_missing_grpc: "vulcan_host_target 이 아직 설정되지 않았습니다.",
    user_manager_loaded_users: "{count}명의 사용자를 불러왔습니다.",
    user_manager_item_current_subtitle: "#{id} · 현재 유효한 사용자",
    user_manager_item_bind_subtitle: "#{id} · {scope} 에 바인드",
    user_manager_status_bound_local: "{scope} user_id 를 {name} (#{id})에 바인드했습니다.",
    user_manager_status_resolving: "사용자 \"{name}\" 확인 중...",
    user_manager_status_created: "사용자를 생성했습니다: {name} (#{id}).",
    user_manager_status_resolved: "사용자를 확인했습니다: {name} (#{id}).",
    user_manager_status_switched: "{scope} 사용자를 {name} (#{id})로 전환했습니다.",
    user_manager_no_selectable: "현재 선택 가능한 user-manager 항목이 없습니다.",
    user_manager_selected_user: "선택된 사용자: {name}",
    user_manager_selected_user_id: "사용자 ID: {id}",
    user_manager_already_bound: "이 사용자는 이미 현재 유효한 바인딩입니다.",
    user_manager_press_bind: "Enter 또는 클릭으로 이 사용자를 {scope} 에 바인드합니다.",
    user_manager_scope_note: "현재 선택된 쓰기 범위는 {scope} 입니다.",
    user_manager_toast_title: "VMM 사용자 관리자",
    user_manager_toast_switched: "{scope} 사용자를 {name} (#{id})로 전환했습니다.",
    user_manager_keys_hint:
      "키: 위/아래 선택, Enter 실행, Esc 돌아가기.",
    user_manager_new_user_title: "새 사용자",
    user_manager_new_user_subtitle: "이름으로 사용자를 확인하거나 생성합니다.",
    user_manager_refresh_title: "목록 새로고침",
    user_manager_refresh_subtitle: "VMM 에서 live 데이터를 다시 불러옵니다.",
    back_setting_title: "제어 패널로 돌아가기",
    back_setting_subtitle: "기능 목록으로 돌아갑니다.",
    new_user_dialog_title: "새 VMM 사용자",
    new_user_dialog_placeholder: "사용자 이름",
    new_user_dialog_description:
      "사용자 이름을 입력하고 Enter 를 눌러 확인 또는 생성한 뒤 로컬에 바인드합니다.",
    new_user_dialog_empty: "사용자 이름은 비워 둘 수 없습니다.",
    summary_ok: "{label}: 성공",
    summary_handshake_timeout: "{label}: 핸드셰이크 시간 초과",
    summary_receive_timeout: "{label}: 응답 시간 초과",
    summary_failed: "{label}: 실패",
  },
}

/**
 * Supplemental compact translations for newer overlay-style TUI flows.
 * 新版覆盖层 TUI 流程使用的补充紧凑翻译目录。
 *
 * The original compact catalogs covered the first shipped screens, but later
 * overlays introduced new launcher, scope, language, memory, and profile UI
 * strings. These overrides fill those newer surfaces so supported non-English
 * languages no longer fall back to English in the shared TUI layer.
 * 第一版紧凑目录覆盖的是最早交付的界面，后续覆盖层又引入了新的首页、
 * 作用域、语言、记忆和画像文案。这里用补充覆盖把这些新增界面补齐，
 * 让受支持的非英文语言不再在共享 TUI 层回退到英文。
 */
const VMM_TUI_CATALOGS_SUPPLEMENTAL: Record<
  Exclude<VmmLanguage, "en" | "zh-CN">,
  Partial<VmmTuiCatalog>
> = {
  es: {},
  fr: {},
  de: {},
  ja: {},
  ko: {},
}

/**
 * Spanish supplemental translations for overlay-first TUI surfaces.
 * 面向覆盖层主流程 TUI 界面的西班牙语补充翻译。
 */
Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.es, {
  setting_home_filter_placeholder: "Filtra rápido por el nombre inglés del comando...",
  setting_home_list_title: "Lista de comandos",
  setting_home_empty: "No hay comandos para este filtro.",
  setting_home_keys_hint: "Escribe para filtrar | ↑↓/j/k mover | Enter abrir | Esc limpiar/volver",
  setting_home_status_user: "Usuario actual",
  setting_home_status_project: "Proyecto actual",
  setting_home_status_language: "Idioma",
  setting_home_status_mode: "Modo",
  setting_home_status_turns: "Turnos",
  setting_home_status_compact: "Compacto",
  setting_home_mode_visible: "Visible",
  setting_home_mode_implicit: "Implícito",
  selector_scope_title: "Ámbito de escritura",
  selector_target_title: "Objetivo",
  dialog_select_keys_hint: "↑↓ seleccionar | Enter confirmar | Esc/clic derecho cancelar",
  setting_menu_project_manager_subtitle: "Listar, crear y cambiar proyectos VMM.",
  setting_menu_project_manager_detail_1: "Abrir una ventana dedicada para el control de proyectos.",
  setting_menu_project_manager_detail_2: "La ventana obtiene la lista de proyectos activa desde VMM.",
  setting_menu_project_manager_detail_3:
    "Puedes enlazar un proyecto existente o crear una ruta Team/Space/Project estándar.",
  setting_menu_project_manager_detail_4:
    "La gestión de proyectos admite los ámbitos workspace y global.",
  setting_menu_profile_center_subtitle: "Inspeccionar y editar nodos de perfil VMM activos.",
  setting_menu_profile_center_detail_1:
    "Cambiar entre objetivos de perfil user, project, team y space.",
  setting_menu_profile_center_detail_2:
    "Refrescar nodos activos o añadir una instrucción manual en la misma ventana.",
  setting_menu_profile_center_detail_3:
    "La lectura del perfil solicita el corte máximo permitido por el backend.",
  setting_menu_profile_bundle_test_subtitle:
    "Leer el bundle de perfil completo para el vínculo actual.",
  setting_menu_profile_bundle_test_detail_1:
    "Usa un flujo aislado para verificar el nuevo RPC de bundle completo.",
  setting_menu_profile_bundle_test_detail_2:
    "Este panel es solo de prueba y no forma parte del centro de perfil principal.",
  setting_menu_language_subtitle: "Configurar anulaciones locales o globales del idioma VMM.",
  setting_menu_language_detail_1:
    "Elegir un idioma soportado o limpiar la anulación del ámbito actual.",
  setting_menu_language_detail_2:
    "La ventana TUI cambia al idioma efectivo en cuanto se guarda.",
  setting_menu_language_detail_3:
    "Las descripciones del panel de comandos aún requieren reiniciar OpenCode.",
  setting_menu_memory_subtitle:
    "Configurar modo visible/implícito, turnos implícitos, refresco del perfil y recuperación sensible a compactación.",
  setting_menu_memory_detail_1:
    "Cambiar entre inyección de memoria visible e implícita.",
  setting_menu_memory_detail_2:
    "Ajustar implicit_memory_turns, profile_refresh_turns y la recuperación sensible a compactación en la misma ventana.",
  setting_menu_memory_detail_3: "También admite los ámbitos workspace y global.",
  setting_menu_grpc_transport_title: "Transporte gRPC",
  setting_menu_grpc_transport_subtitle:
    "Configurar tiempo keepalive, timeout y estrategia de ping en reposo.",
  setting_menu_grpc_transport_detail_1:
    "Editar grpc_keepalive_time_ms para controlar cada cuánto una conexión inactiva envía un ping de salud.",
  setting_menu_grpc_transport_detail_2:
    "Editar grpc_keepalive_timeout_ms para controlar cuánto espera un keepalive por su ACK.",
  setting_menu_grpc_transport_detail_3:
    "Cambiar grpc_keepalive_permit_without_calls para decidir si se permite keepalive sin RPC activos.",
  user_manager_overlay_scope_dialog_title: "¿En qué ámbito guardar este usuario?",
  user_manager_overlay_scope_workspace_title: "Espacio de trabajo actual",
  user_manager_overlay_scope_workspace_subtitle:
    "Guardar este usuario en la configuración del espacio de trabajo actual.",
  user_manager_overlay_scope_global_title: "Configuración global",
  user_manager_overlay_scope_global_subtitle:
    "Guardar este usuario en la configuración global compartida.",
  user_manager_overlay_scope_delete_title: "Eliminar cuenta",
  user_manager_overlay_scope_delete_subtitle:
    "Borrar esta cuenta y sus datos asociados después de la confirmación.",
  user_manager_overlay_replace_global_title: "Elegir usuario global de reemplazo",
  project_manager_overlay_scope_dialog_title: "¿En qué ámbito guardar este proyecto?",
  project_manager_overlay_scope_workspace_title: "Espacio de trabajo actual",
  project_manager_overlay_scope_workspace_subtitle:
    "Guardar este proyecto en la configuración del espacio de trabajo actual.",
  project_manager_overlay_scope_global_title: "Configuración global",
  project_manager_overlay_scope_global_subtitle:
    "Guardar este proyecto en la configuración global compartida.",
  project_manager_overlay_scope_delete_title: "Eliminar proyecto",
  project_manager_overlay_scope_delete_subtitle:
    "Eliminar este proyecto tras confirmar la ruta completa.",
  project_manager_overlay_scope_migrate_title: "Migrar proyecto",
  project_manager_overlay_scope_migrate_subtitle:
    "Mover este proyecto a una nueva ruta objetivo y actualizar los enlaces afectados.",
  project_manager_overlay_replace_global_title: "Elegir proyecto global de reemplazo",
  language_control_title: "Control de idioma VMM",
  language_control_subtitle: "Elegir una anulación local o global del idioma de la interfaz VMM.",
  language_control_section_list: "Idiomas",
  language_control_current_effective: "Idioma efectivo actual: {value}",
  language_control_write_scope: "Ámbito de escritura actual: {scope}",
  language_control_status: "Estado",
  language_control_keys_hint: "Teclas: Arriba/Abajo seleccionar, Enter aplicar, Esc volver.",
  language_control_list_title: "Lista de idiomas",
  language_control_loading: "Cargando lista de idiomas...",
  language_control_group_actions: "Funciones",
  language_control_group_languages: "Lista de idiomas",
  language_control_workspace_summary: "WorkspaceLanguage:{value}",
  language_control_global_summary: "GlobalLanguage:{value}",
  language_control_effective_summary: "Effective:{value}",
  language_control_inherit_global_value: "Heredar global",
  language_control_status_loaded: "LanguageCount:{count}",
  language_control_scope_dialog_title: "¿Dónde guardar este idioma?",
  language_control_scope_workspace_title: "Espacio de trabajo actual",
  language_control_scope_workspace_subtitle:
    "Guardar este idioma en la configuración del espacio de trabajo actual.",
  language_control_scope_global_title: "Configuración global",
  language_control_scope_global_subtitle:
    "Guardar este idioma en la configuración global compartida.",
  language_control_clear_title: "El idioma del workspace hereda del global",
  language_control_clear_subtitle:
    "Borrar la anulación del workspace y volver a heredar del valor global.",
  memory_settings_title: "Ajustes de memoria VMM",
  memory_settings_subtitle: "Elige primero una función y luego el ámbito de escritura.",
  memory_settings_section_list: "Controles de memoria",
  memory_settings_loading: "Cargando ajustes de memoria...",
  memory_settings_scope_dialog_title: "¿En qué ámbito guardar este ajuste de memoria?",
  memory_settings_scope_workspace_title: "Espacio de trabajo actual",
  memory_settings_scope_workspace_subtitle:
    "Guardar este ajuste de memoria en el espacio de trabajo actual.",
  memory_settings_scope_global_title: "Configuración global",
  memory_settings_scope_global_subtitle:
    "Guardar este ajuste de memoria en la configuración global compartida.",
  memory_settings_keys_hint:
    "Teclas: Arriba/Abajo seleccionar, Enter continuar, Esc/clic derecho cerrar.",
  memory_settings_inherit_value: "Heredar",
  memory_settings_state_pair: "Proyecto:{project}|Global:{global}",
  memory_settings_session_compact_enabled_value: "Activado",
  memory_settings_session_compact_disabled_value: "Desactivado",
  memory_settings_mode_adjust_title: "Ajustar modo de inyección",
  memory_settings_mode_adjust_subtitle:
    "Cambiar entre inyección visible e implícita.",
  memory_settings_mode_select_title: "Elegir modo de inyección para {scope}",
  memory_settings_mode_visible_title: "Modo de inyección visible",
  memory_settings_mode_visible_subtitle:
    "Elige un ámbito y cámbialo a inyección de memoria visible.",
  memory_settings_mode_implicit_title: "Modo de inyección implícita",
  memory_settings_mode_implicit_subtitle:
    "Cambiar el ámbito elegido a inyección de memoria implícita.",
  memory_settings_turns_title: "Configurar turnos implícitos",
  memory_settings_turns_subtitle:
    "Elegir un ámbito y editar su valor implicit_memory_turns.",
  memory_settings_profile_refresh_title: "Configurar turnos de refresco del perfil",
  memory_settings_profile_refresh_subtitle:
    "Elegir un ámbito y editar su valor profile_refresh_turns.",
  memory_settings_session_compact_adjust_title: "Ajustar recuperación con compactación",
  memory_settings_session_compact_adjust_subtitle:
    "Controlar la recuperación sensible a compactación y las notificaciones compact.",
  memory_settings_session_compact_select_title:
    "Elegir modo de recuperación con compactación para {scope}",
  memory_settings_session_compact_on_title: "Activar recuperación con compactación",
  memory_settings_session_compact_on_subtitle:
    "Elegir un ámbito y activar la recuperación sensible a compactación y las notificaciones compact.",
  memory_settings_session_compact_on_detail_1:
    "Cuando está activado, PreCheck usa el modo session compact recall y el hook de compactación envía confirmaciones ChatCompact.",
  memory_settings_session_compact_on_detail_2:
    "Úsalo para evitar reabrir la cola no compactada todavía viva después de compactar.",
  memory_settings_session_compact_off_title: "Desactivar recuperación con compactación",
  memory_settings_session_compact_off_subtitle:
    "Elegir un ámbito y volver al modo legacy de PreCheck sin notificaciones compact.",
  memory_settings_session_compact_off_detail_1:
    "Cuando está desactivado, el hook de compactación no notifica a VMM y PreCheck conserva el modo legacy.",
  memory_settings_session_compact_off_detail_2:
    "Úsalo solo cuando este host o flujo no deba participar en la recuperación sensible a compactación.",
  memory_settings_saved_session_compact_on:
    "La recuperación sensible a compactación ya está activada en {scope}.",
  memory_settings_saved_session_compact_off:
    "La recuperación sensible a compactación ya está desactivada en {scope}.",
  grpc_transport_section_list: "Controles de transporte gRPC",
  grpc_transport_loading: "Cargando ajustes de transporte gRPC...",
  grpc_transport_scope_dialog_title:
    "¿En qué ámbito guardar este ajuste de transporte gRPC?",
  grpc_transport_scope_workspace_subtitle:
    "Guardar este ajuste de transporte gRPC en el espacio de trabajo actual.",
  grpc_transport_scope_global_subtitle:
    "Guardar este ajuste de transporte gRPC en la configuración global compartida.",
  grpc_transport_toast_title: "Ajustes de transporte gRPC",
  grpc_transport_keepalive_time_title: "Configurar tiempo de keepalive",
  grpc_transport_keepalive_time_subtitle:
    "Elegir un ámbito y editar grpc_keepalive_time_ms.",
  grpc_transport_keepalive_timeout_title: "Configurar timeout de keepalive",
  grpc_transport_keepalive_timeout_subtitle:
    "Elegir un ámbito y editar grpc_keepalive_timeout_ms.",
  grpc_transport_permit_title: "Ajustar keepalive sin llamadas",
  grpc_transport_permit_subtitle:
    "Elegir un ámbito y cambiar grpc_keepalive_permit_without_calls.",
  grpc_transport_save_failed:
    "No se pudo guardar el ajuste de transporte gRPC. Inténtalo de nuevo.",
  grpc_transport_keepalive_time_prompt_title: "Configurar tiempo de keepalive (ms)",
  grpc_transport_keepalive_time_prompt_placeholder: "Entero positivo en milisegundos",
  grpc_transport_keepalive_time_prompt_description:
    "Introduce grpc_keepalive_time_ms. Controla cada cuánto una conexión inactiva envía un ping keepalive.",
  grpc_transport_keepalive_time_prompt_empty:
    "El tiempo de keepalive no puede estar vacío.",
  grpc_transport_keepalive_time_prompt_invalid:
    "grpc_keepalive_time_ms debe ser un entero positivo.",
  grpc_transport_keepalive_timeout_prompt_title:
    "Configurar timeout de keepalive (ms)",
  grpc_transport_keepalive_timeout_prompt_placeholder:
    "Entero positivo en milisegundos",
  grpc_transport_keepalive_timeout_prompt_description:
    "Introduce grpc_keepalive_timeout_ms. Controla cuánto espera un keepalive por un ACK.",
  grpc_transport_keepalive_timeout_prompt_empty:
    "El timeout de keepalive no puede estar vacío.",
  grpc_transport_keepalive_timeout_prompt_invalid:
    "grpc_keepalive_timeout_ms debe ser un entero positivo.",
  grpc_transport_keepalive_timeout_exceeds_time:
    "El timeout de keepalive debe ser menor que el tiempo de keepalive.",
  grpc_transport_keepalive_time_below_timeout:
    "El tiempo de keepalive no debe ser menor que el timeout actual.",
  grpc_transport_permit_select_title:
    "Elegir comportamiento sin llamadas para {scope}",
  grpc_transport_permit_disabled_title: "Desactivar ping en reposo sin llamadas",
  grpc_transport_permit_disabled_subtitle:
    "Permitir keepalive solo mientras existan RPC activos.",
  grpc_transport_permit_enabled_title: "Activar ping en reposo sin llamadas",
  grpc_transport_permit_enabled_subtitle:
    "Permitir keepalive incluso cuando no haya RPC activos.",
  grpc_transport_saved_keepalive_time:
    "El tiempo keepalive de {scope} ahora es {value} ms.",
  grpc_transport_saved_keepalive_timeout:
    "El timeout keepalive de {scope} ahora es {value} ms.",
  grpc_transport_saved_permit_on:
    "El keepalive sin llamadas ya está activado en {scope}.",
  grpc_transport_saved_permit_off:
    "El keepalive sin llamadas ya está desactivado en {scope}.",
  profile_center_title: "Centro de perfil VMM",
  profile_center_subtitle:
    "Elegir un objetivo de perfil, inspeccionar nodos o añadir una instrucción manual.",
  profile_center_section_actions: "Acciones",
  profile_center_section_nodes: "Tabla de nodos activos",
  profile_center_loading: "Cargando nodos de perfil...",
  profile_center_loaded_nodes: "Se cargaron {count} nodos de perfil activos.",
  profile_center_launcher_title: "Centro de perfil",
  profile_center_launcher_subtitle:
    "Elige primero un objetivo de perfil y luego abre su espacio de trabajo.",
  profile_center_launcher_hint:
    "Teclas: Arriba/Abajo elegir objetivo, Enter abrir, Esc/clic derecho volver.",
  profile_center_launcher_status_idle: "Elige un objetivo de perfil para empezar.",
  profile_center_workspace_header: "Espacio de trabajo de perfil {value}",
  profile_center_workspace_hint:
    "Teclas: Izquierda/Derecha acciones, Arriba/Abajo nodos, Enter inspeccionar o ejecutar, Esc/clic derecho volver.",
  profile_center_filter_placeholder: "Filtrar nodos de perfil por contenido, fuente, id o fecha...",
  profile_center_details_title: "Detalle del nodo de perfil",
  profile_center_details_hint:
    "Selecciona un nodo arriba para ver abajo sus tablas de detalle completas.",
  profile_center_details_meta_title: "Campos estructurados",
  profile_target_user_launcher: "Perfil de usuario",
  profile_target_project_launcher: "Perfil de proyecto",
  profile_target_space_launcher: "Perfil de espacio",
  profile_target_team_launcher: "Perfil de equipo",
  profile_detail_field_node_id: "ID del nodo",
  profile_detail_field_target: "Objetivo",
  profile_detail_field_bind_id: "ID vinculado",
  profile_detail_field_priority: "Prioridad",
  profile_detail_field_level: "Nivel",
  profile_detail_field_refresh_weight: "Peso de refresco",
  profile_detail_field_profile_date: "Fecha de perfil",
  profile_detail_field_expires: "Caduca",
  profile_detail_field_source: "Origen",
  profile_detail_field_source_id: "ID de origen",
  profile_detail_field_content: "Detalle del perfil",
  profile_detail_field_reason: "Razón de nivel",
  profile_target_user: "Usuario",
  profile_target_project: "Proyecto",
  profile_target_team: "Equipo",
  profile_target_space: "Espacio",
  profile_table_scope: "Objetivo",
  profile_table_expires: "Caduca",
  profile_table_source: "Origen",
  profile_table_content: "Detalle",
  scope_local_title: "Ámbito de escritura: workspace",
  scope_global_title: "Ámbito de escritura: global",
  scope_selected_subtitle: "{scope} es el ámbito de escritura actual.",
  scope_switch_subtitle: "Cambiar el ámbito de escritura actual a {scope}.",
  scope_detail_selected: "{scope} ya está seleccionado como ámbito de escritura.",
  scope_detail_switch: "Usa esto para guardar el próximo cambio en {scope}.",
  back_setting_title: "Volver al panel",
  back_setting_subtitle: "Volver a la lista de funciones.",
  back_setting_detail_1: "Volver al panel de ajustes de nivel superior.",
  back_setting_detail_2: "Esto mantiene el flujo basado en lista y ventanas.",
})

/**
 * French supplemental translations for overlay-first TUI surfaces.
 * 面向覆盖层主流程 TUI 界面的法语补充翻译。
 */
Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.fr, {
  setting_home_filter_placeholder: "Filtrer vite par le nom anglais de la commande...",
  setting_home_list_title: "Liste des commandes",
  setting_home_empty: "Aucune commande pour ce filtre.",
  setting_home_keys_hint: "Saisir pour filtrer | ↑↓/j/k déplacer | Entrée ouvrir | Esc effacer/retour",
  setting_home_status_user: "Utilisateur courant",
  setting_home_status_project: "Projet courant",
  setting_home_status_language: "Langue",
  setting_home_status_mode: "Mode",
  setting_home_status_turns: "Tours",
  setting_home_status_compact: "Compact",
  setting_home_mode_visible: "Visible",
  setting_home_mode_implicit: "Implicite",
  selector_scope_title: "Portée d'écriture",
  selector_target_title: "Cible",
  dialog_select_keys_hint: "↑↓ sélectionner | Entrée confirmer | Esc/clic droit annuler",
  setting_menu_project_manager_subtitle: "Lister, créer et changer les projets VMM.",
  setting_menu_project_manager_detail_1: "Ouvrir une fenêtre dédiée de contrôle des projets.",
  setting_menu_project_manager_detail_2: "Cette fenêtre récupère la liste live des projets depuis VMM.",
  setting_menu_project_manager_detail_3:
    "Tu peux lier un projet existant ou créer un chemin Team/Space/Project standard.",
  setting_menu_project_manager_detail_4:
    "La gestion des projets prend en charge workspace et global.",
  setting_menu_profile_center_subtitle: "Inspecter et modifier les nœuds de profil VMM actifs.",
  setting_menu_profile_center_detail_1:
    "Basculer entre les cibles de profil user, project, team et space.",
  setting_menu_profile_center_detail_2:
    "Rafraîchir les nœuds actifs ou ajouter une instruction manuelle dans la même fenêtre.",
  setting_menu_profile_center_detail_3:
    "La lecture du profil demande la tranche maximale autorisée par le backend.",
  setting_menu_profile_bundle_test_subtitle:
    "Lire le bundle de profil complet pour la liaison courante.",
  setting_menu_profile_bundle_test_detail_1:
    "Utilise un flux isolé pour vérifier le nouveau RPC de bundle complet.",
  setting_menu_profile_bundle_test_detail_2:
    "Ce panneau est purement de test et ne fait pas partie du centre de profil principal.",
  setting_menu_language_subtitle: "Définir des surcharges locales ou globales de langue pour l'interface VMM.",
  setting_menu_language_detail_1:
    "Choisir une langue prise en charge ou effacer la surcharge du scope courant.",
  setting_menu_language_detail_2:
    "La fenêtre TUI bascule immédiatement vers la langue effective après sauvegarde.",
  setting_menu_language_detail_3:
    "Les descriptions de palette nécessitent toujours un redémarrage d'OpenCode.",
  setting_menu_memory_subtitle:
    "Configurer le mode visible/implicite, les tours implicites, le rafraîchissement du profil et le rappel sensible à la compaction.",
  setting_menu_memory_detail_1:
    "Basculer entre l'injection mémoire visible et implicite.",
  setting_menu_memory_detail_2:
    "Ajuster implicit_memory_turns, profile_refresh_turns et le rappel sensible à la compaction dans la même fenêtre.",
  setting_menu_memory_detail_3: "Cette vue prend aussi en charge workspace et global.",
  setting_menu_grpc_transport_title: "Transport gRPC",
  setting_menu_grpc_transport_subtitle:
    "Configurer le keepalive, son timeout et la stratégie de ping à vide.",
  setting_menu_grpc_transport_detail_1:
    "Modifier grpc_keepalive_time_ms pour contrôler la fréquence des pings sur connexion idle.",
  setting_menu_grpc_transport_detail_2:
    "Modifier grpc_keepalive_timeout_ms pour contrôler l'attente d'un ACK keepalive.",
  setting_menu_grpc_transport_detail_3:
    "Changer grpc_keepalive_permit_without_calls pour décider si le keepalive est permis sans RPC actif.",
  user_manager_overlay_scope_dialog_title: "Dans quelle portée enregistrer cet utilisateur ?",
  user_manager_overlay_scope_workspace_title: "Espace de travail courant",
  user_manager_overlay_scope_workspace_subtitle:
    "Enregistrer cet utilisateur dans la configuration de l'espace de travail courant.",
  user_manager_overlay_scope_global_title: "Configuration globale",
  user_manager_overlay_scope_global_subtitle:
    "Enregistrer cet utilisateur dans la configuration globale partagée.",
  user_manager_overlay_scope_delete_title: "Supprimer le compte",
  user_manager_overlay_scope_delete_subtitle:
    "Supprimer ce compte et ses données liées après confirmation.",
  user_manager_overlay_replace_global_title: "Choisir l'utilisateur global de remplacement",
  project_manager_overlay_scope_dialog_title: "Dans quelle portée enregistrer ce projet ?",
  project_manager_overlay_scope_workspace_title: "Espace de travail courant",
  project_manager_overlay_scope_workspace_subtitle:
    "Enregistrer ce projet dans la configuration de l'espace de travail courant.",
  project_manager_overlay_scope_global_title: "Configuration globale",
  project_manager_overlay_scope_global_subtitle:
    "Enregistrer ce projet dans la configuration globale partagée.",
  project_manager_overlay_scope_delete_title: "Supprimer le projet",
  project_manager_overlay_scope_delete_subtitle:
    "Supprimer ce projet après confirmation du chemin complet.",
  project_manager_overlay_scope_migrate_title: "Migrer le projet",
  project_manager_overlay_scope_migrate_subtitle:
    "Déplacer ce projet vers un nouveau chemin cible et mettre à jour les liaisons touchées.",
  project_manager_overlay_replace_global_title: "Choisir le projet global de remplacement",
  language_control_title: "Contrôle de langue VMM",
  language_control_subtitle:
    "Choisir une surcharge locale ou globale de langue d'interface VMM.",
  language_control_section_list: "Langues",
  language_control_current_effective: "Langue effective actuelle : {value}",
  language_control_write_scope: "Portée d'écriture actuelle : {scope}",
  language_control_status: "Statut",
  language_control_keys_hint: "Touches : Haut/Bas sélectionner, Entrée appliquer, Esc revenir.",
  language_control_list_title: "Liste des langues",
  language_control_loading: "Chargement de la liste des langues...",
  language_control_group_actions: "Fonctions",
  language_control_group_languages: "Liste des langues",
  language_control_workspace_summary: "WorkspaceLanguage:{value}",
  language_control_global_summary: "GlobalLanguage:{value}",
  language_control_effective_summary: "Effective:{value}",
  language_control_inherit_global_value: "Hériter du global",
  language_control_status_loaded: "LanguageCount:{count}",
  language_control_scope_dialog_title: "Où enregistrer cette langue ?",
  language_control_scope_workspace_title: "Espace de travail courant",
  language_control_scope_workspace_subtitle:
    "Enregistrer cette langue dans la configuration de l'espace de travail courant.",
  language_control_scope_global_title: "Configuration globale",
  language_control_scope_global_subtitle:
    "Enregistrer cette langue dans la configuration globale partagée.",
  language_control_clear_title: "La langue du workspace hérite du global",
  language_control_clear_subtitle:
    "Effacer la surcharge du workspace et réhériter de la valeur globale.",
  memory_settings_title: "Réglages mémoire VMM",
  memory_settings_subtitle: "Choisir d'abord une fonction, puis la portée d'écriture.",
  memory_settings_section_list: "Contrôles mémoire",
  memory_settings_loading: "Chargement des réglages mémoire...",
  memory_settings_scope_dialog_title: "Dans quelle portée enregistrer ce réglage mémoire ?",
  memory_settings_scope_workspace_title: "Espace de travail courant",
  memory_settings_scope_workspace_subtitle:
    "Enregistrer ce réglage mémoire dans l'espace de travail courant.",
  memory_settings_scope_global_title: "Configuration globale",
  memory_settings_scope_global_subtitle:
    "Enregistrer ce réglage mémoire dans la configuration globale partagée.",
  memory_settings_keys_hint:
    "Touches : Haut/Bas sélectionner, Entrée continuer, Esc/clic droit fermer.",
  memory_settings_inherit_value: "Hériter",
  memory_settings_state_pair: "Projet:{project}|Global:{global}",
  memory_settings_session_compact_enabled_value: "Activé",
  memory_settings_session_compact_disabled_value: "Désactivé",
  memory_settings_mode_adjust_title: "Ajuster le mode d'injection",
  memory_settings_mode_adjust_subtitle:
    "Basculer entre injection visible et implicite.",
  memory_settings_mode_select_title: "Choisir le mode d'injection pour {scope}",
  memory_settings_mode_visible_title: "Mode d'injection visible",
  memory_settings_mode_visible_subtitle:
    "Choisir une portée puis la basculer vers l'injection mémoire visible.",
  memory_settings_mode_implicit_title: "Mode d'injection implicite",
  memory_settings_mode_implicit_subtitle:
    "Basculer la portée choisie vers l'injection mémoire implicite.",
  memory_settings_turns_title: "Définir les tours implicites",
  memory_settings_turns_subtitle:
    "Choisir une portée puis modifier sa valeur implicit_memory_turns.",
  memory_settings_profile_refresh_title: "Définir les tours de rafraîchissement du profil",
  memory_settings_profile_refresh_subtitle:
    "Choisir une portée puis modifier sa valeur profile_refresh_turns.",
  memory_settings_session_compact_adjust_title: "Ajuster le rappel avec compaction",
  memory_settings_session_compact_adjust_subtitle:
    "Contrôler le rappel sensible à la compaction et les notifications compact.",
  memory_settings_session_compact_select_title:
    "Choisir le mode de rappel avec compaction pour {scope}",
  memory_settings_session_compact_on_title: "Activer le rappel avec compaction",
  memory_settings_session_compact_on_subtitle:
    "Choisir une portée puis activer le rappel sensible à la compaction et les notifications compact.",
  memory_settings_session_compact_on_detail_1:
    "Lorsqu'il est activé, PreCheck utilise le mode session compact recall et le hook de compaction envoie des confirmations ChatCompact.",
  memory_settings_session_compact_on_detail_2:
    "Utilisez-le pour éviter de rouvrir la queue non compactée encore vivante après compaction.",
  memory_settings_session_compact_off_title: "Désactiver le rappel avec compaction",
  memory_settings_session_compact_off_subtitle:
    "Choisir une portée puis revenir au mode legacy de PreCheck sans notifications compact.",
  memory_settings_session_compact_off_detail_1:
    "Lorsqu'il est désactivé, le hook de compaction ne notifie pas VMM et PreCheck conserve le mode legacy.",
  memory_settings_session_compact_off_detail_2:
    "Utilisez-le seulement si cet hôte ou ce flux ne doit pas participer au rappel sensible à la compaction.",
  memory_settings_saved_session_compact_on:
    "Le rappel sensible à la compaction est maintenant activé dans {scope}.",
  memory_settings_saved_session_compact_off:
    "Le rappel sensible à la compaction est maintenant désactivé dans {scope}.",
  grpc_transport_section_list: "Contrôles transport gRPC",
  grpc_transport_loading: "Chargement des réglages transport gRPC...",
  grpc_transport_scope_dialog_title:
    "Dans quelle portée enregistrer ce réglage transport gRPC ?",
  grpc_transport_scope_workspace_subtitle:
    "Enregistrer ce réglage transport gRPC dans l'espace de travail courant.",
  grpc_transport_scope_global_subtitle:
    "Enregistrer ce réglage transport gRPC dans la configuration globale partagée.",
  grpc_transport_toast_title: "Réglages transport gRPC",
  grpc_transport_keepalive_time_title: "Définir le temps de keepalive",
  grpc_transport_keepalive_time_subtitle:
    "Choisir une portée puis modifier grpc_keepalive_time_ms.",
  grpc_transport_keepalive_timeout_title: "Définir le timeout keepalive",
  grpc_transport_keepalive_timeout_subtitle:
    "Choisir une portée puis modifier grpc_keepalive_timeout_ms.",
  grpc_transport_permit_title: "Ajuster le keepalive sans appels",
  grpc_transport_permit_subtitle:
    "Choisir une portée puis changer grpc_keepalive_permit_without_calls.",
  grpc_transport_save_failed:
    "Échec de l'enregistrement du réglage transport gRPC. Veuillez réessayer.",
  grpc_transport_keepalive_time_prompt_title:
    "Définir le temps de keepalive (ms)",
  grpc_transport_keepalive_time_prompt_placeholder:
    "Entier positif en millisecondes",
  grpc_transport_keepalive_time_prompt_description:
    "Saisir grpc_keepalive_time_ms. Il contrôle la fréquence d'envoi d'un ping keepalive sur une connexion idle.",
  grpc_transport_keepalive_time_prompt_empty:
    "Le temps de keepalive ne peut pas être vide.",
  grpc_transport_keepalive_time_prompt_invalid:
    "grpc_keepalive_time_ms doit être un entier positif.",
  grpc_transport_keepalive_timeout_prompt_title:
    "Définir le timeout keepalive (ms)",
  grpc_transport_keepalive_timeout_prompt_placeholder:
    "Entier positif en millisecondes",
  grpc_transport_keepalive_timeout_prompt_description:
    "Saisir grpc_keepalive_timeout_ms. Il contrôle l'attente d'un ACK pour un keepalive.",
  grpc_transport_keepalive_timeout_prompt_empty:
    "Le timeout keepalive ne peut pas être vide.",
  grpc_transport_keepalive_timeout_prompt_invalid:
    "grpc_keepalive_timeout_ms doit être un entier positif.",
  grpc_transport_keepalive_timeout_exceeds_time:
    "Le timeout keepalive doit être inférieur au temps keepalive.",
  grpc_transport_keepalive_time_below_timeout:
    "Le temps keepalive ne doit pas être inférieur au timeout actuel.",
  grpc_transport_permit_select_title:
    "Choisir le comportement sans appels pour {scope}",
  grpc_transport_permit_disabled_title:
    "Désactiver les pings idle sans appels",
  grpc_transport_permit_disabled_subtitle:
    "Autoriser le keepalive uniquement lorsqu'un RPC actif existe.",
  grpc_transport_permit_enabled_title:
    "Activer les pings idle sans appels",
  grpc_transport_permit_enabled_subtitle:
    "Autoriser le keepalive même lorsqu'aucun RPC actif n'existe.",
  grpc_transport_saved_keepalive_time:
    "Le temps keepalive de {scope} est maintenant {value} ms.",
  grpc_transport_saved_keepalive_timeout:
    "Le timeout keepalive de {scope} est maintenant {value} ms.",
  grpc_transport_saved_permit_on:
    "Le keepalive sans appels est maintenant activé dans {scope}.",
  grpc_transport_saved_permit_off:
    "Le keepalive sans appels est maintenant désactivé dans {scope}.",
  profile_center_title: "Centre de profil VMM",
  profile_center_subtitle:
    "Choisir une cible de profil, inspecter ses nœuds ou ajouter une instruction manuelle.",
  profile_center_section_actions: "Actions",
  profile_center_section_nodes: "Table des nœuds actifs",
  profile_center_loading: "Chargement des nœuds de profil...",
  profile_center_loaded_nodes: "{count} nœuds de profil actifs chargés.",
  profile_center_launcher_title: "Centre de profil",
  profile_center_launcher_subtitle:
    "Choisis d'abord une cible de profil puis ouvre son espace de travail.",
  profile_center_launcher_hint:
    "Touches : Haut/Bas choisir la cible, Entrée ouvrir, Esc/clic droit revenir.",
  profile_center_launcher_status_idle: "Choisis une cible de profil pour commencer.",
  profile_center_workspace_header: "Espace de travail du profil {value}",
  profile_center_workspace_hint:
    "Touches : Gauche/Droite actions, Haut/Bas nœuds, Entrée inspecter ou lancer, Esc/clic droit revenir.",
  profile_center_filter_placeholder: "Filtrer les nœuds de profil par contenu, source, id ou date...",
  profile_center_details_title: "Détails du nœud de profil",
  profile_center_details_hint:
    "Sélectionne un nœud ci-dessus pour afficher en dessous ses tables de détail complètes.",
  profile_center_details_meta_title: "Champs structurés",
  profile_target_user_launcher: "Profil utilisateur",
  profile_target_project_launcher: "Profil projet",
  profile_target_space_launcher: "Profil espace",
  profile_target_team_launcher: "Profil équipe",
  profile_detail_field_node_id: "ID du nœud",
  profile_detail_field_target: "Cible",
  profile_detail_field_bind_id: "ID lié",
  profile_detail_field_priority: "Priorité",
  profile_detail_field_level: "Niveau",
  profile_detail_field_refresh_weight: "Poids de rafraîchissement",
  profile_detail_field_profile_date: "Date de profil",
  profile_detail_field_expires: "Expire",
  profile_detail_field_source: "Source",
  profile_detail_field_source_id: "ID de source",
  profile_detail_field_content: "Détail du profil",
  profile_detail_field_reason: "Raison du niveau",
  profile_target_user: "Utilisateur",
  profile_target_project: "Projet",
  profile_target_team: "Équipe",
  profile_target_space: "Espace",
  profile_table_scope: "Cible",
  profile_table_expires: "Expire",
  profile_table_source: "Source",
  profile_table_content: "Détail",
  scope_local_title: "Portée d'écriture : workspace",
  scope_global_title: "Portée d'écriture : global",
  scope_selected_subtitle: "{scope} est la portée d'écriture actuelle.",
  scope_switch_subtitle: "Basculer la portée d'écriture actuelle vers {scope}.",
  scope_detail_selected: "{scope} est déjà sélectionné comme portée d'écriture.",
  scope_detail_switch: "Utilise ceci pour écrire la prochaine modification dans {scope}.",
  back_setting_title: "Retour au panneau",
  back_setting_subtitle: "Revenir à la liste des fonctions.",
  back_setting_detail_1: "Revenir au centre de réglages de niveau supérieur.",
  back_setting_detail_2: "Cela garde un flux basé sur liste et fenêtres.",
})

/**
 * German supplemental translations for overlay-first TUI surfaces.
 * 面向覆盖层主流程 TUI 界面的德语补充翻译。
 */
Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.de, {
  setting_home_filter_placeholder: "Schnell nach englischem Befehlsnamen filtern...",
  setting_home_list_title: "Befehlsliste",
  setting_home_empty: "Für diesen Filter gibt es keine Befehle.",
  setting_home_keys_hint: "Tippen zum Filtern | ↑↓/j/k bewegen | Enter öffnen | Esc leeren/zurück",
  setting_home_status_user: "Aktueller Benutzer",
  setting_home_status_project: "Aktuelles Projekt",
  setting_home_status_language: "Sprache",
  setting_home_status_mode: "Modus",
  setting_home_status_turns: "Turns",
  setting_home_status_compact: "Compact",
  setting_home_mode_visible: "Sichtbar",
  setting_home_mode_implicit: "Implizit",
  selector_scope_title: "Schreibbereich",
  selector_target_title: "Ziel",
  dialog_select_keys_hint: "↑↓ wählen | Enter bestätigen | Esc/Rechtsklick abbrechen",
  setting_menu_project_manager_subtitle: "VMM-Projekte auflisten, erstellen und wechseln.",
  setting_menu_project_manager_detail_1: "Ein eigenes Projekt-Steuerfenster öffnen.",
  setting_menu_project_manager_detail_2: "Das Fenster lädt die Live-Projektliste direkt aus VMM.",
  setting_menu_project_manager_detail_3:
    "Du kannst ein bestehendes Projekt binden oder einen Standardpfad Team/Space/Project anlegen.",
  setting_menu_project_manager_detail_4: "Die Projektverwaltung unterstützt Workspace und Global.",
  setting_menu_profile_center_subtitle: "Aktive VMM-Profilknoten prüfen und bearbeiten.",
  setting_menu_profile_center_detail_1:
    "Zwischen den Profilzielen user, project, team und space wechseln.",
  setting_menu_profile_center_detail_2:
    "Aktive Knoten aktualisieren oder im selben Fenster eine manuelle Anweisung ergänzen.",
  setting_menu_profile_center_detail_3:
    "Das Profil liest immer den maximal erlaubten Backend-Slice.",
  setting_menu_profile_bundle_test_subtitle:
    "Das vollständige Profil-Bundle für die aktuelle Bindung lesen.",
  setting_menu_profile_bundle_test_detail_1:
    "Verwendet einen isolierten Testfluss für den neuen Full-Bundle-RPC.",
  setting_menu_profile_bundle_test_detail_2:
    "Dieses Panel dient nur zum Testen und gehört nicht zum Haupt-Profilzentrum.",
  setting_menu_language_subtitle: "Lokale oder globale VMM-Sprachüberschreibungen festlegen.",
  setting_menu_language_detail_1:
    "Eine unterstützte Sprache wählen oder die Überschreibung des aktuellen Scopes löschen.",
  setting_menu_language_detail_2:
    "Das TUI-Fenster wechselt direkt nach dem Speichern in die neue effektive Sprache.",
  setting_menu_language_detail_3:
    "Die Beschreibungen in der Befehlspalette brauchen weiterhin einen OpenCode-Neustart.",
  setting_menu_memory_subtitle:
    "Sichtbaren/impliziten Modus, implizite Turns, Profil-Refresh-Turns und compact-aware Recall konfigurieren.",
  setting_menu_memory_detail_1: "Zwischen sichtbarer und impliziter Speichereinspritzung wechseln.",
  setting_menu_memory_detail_2:
    "implicit_memory_turns, profile_refresh_turns und compact-aware Recall im selben Fenster anpassen.",
  setting_menu_memory_detail_3: "Auch hier werden Workspace und Global unterstützt.",
  setting_menu_grpc_transport_title: "gRPC-Transport",
  setting_menu_grpc_transport_subtitle:
    "Keepalive-Zeit, Timeout und Idle-Ping-Strategie konfigurieren.",
  setting_menu_grpc_transport_detail_1:
    "grpc_keepalive_time_ms anpassen, um die Ping-Frequenz für idle Verbindungen zu steuern.",
  setting_menu_grpc_transport_detail_2:
    "grpc_keepalive_timeout_ms anpassen, um die Wartezeit auf ein Keepalive-ACK zu steuern.",
  setting_menu_grpc_transport_detail_3:
    "grpc_keepalive_permit_without_calls umschalten, um Keepalive ohne aktive RPCs zu erlauben oder zu verbieten.",
  user_manager_overlay_scope_dialog_title: "In welchem Bereich soll dieser Benutzer gespeichert werden?",
  user_manager_overlay_scope_workspace_title: "Aktueller Workspace",
  user_manager_overlay_scope_workspace_subtitle:
    "Diesen Benutzer in der aktuellen Workspace-Konfiguration speichern.",
  user_manager_overlay_scope_global_title: "Globale Konfiguration",
  user_manager_overlay_scope_global_subtitle:
    "Diesen Benutzer in der gemeinsamen globalen Konfiguration speichern.",
  user_manager_overlay_scope_delete_title: "Konto löschen",
  user_manager_overlay_scope_delete_subtitle:
    "Dieses Konto und seine verknüpften Daten nach Bestätigung löschen.",
  user_manager_overlay_replace_global_title: "Globalen Ersatzbenutzer wählen",
  project_manager_overlay_scope_dialog_title: "In welchem Bereich soll dieses Projekt gespeichert werden?",
  project_manager_overlay_scope_workspace_title: "Aktueller Workspace",
  project_manager_overlay_scope_workspace_subtitle:
    "Dieses Projekt in der aktuellen Workspace-Konfiguration speichern.",
  project_manager_overlay_scope_global_title: "Globale Konfiguration",
  project_manager_overlay_scope_global_subtitle:
    "Dieses Projekt in der gemeinsamen globalen Konfiguration speichern.",
  project_manager_overlay_scope_delete_title: "Projekt löschen",
  project_manager_overlay_scope_delete_subtitle:
    "Dieses Projekt nach Bestätigung des vollständigen Pfads löschen.",
  project_manager_overlay_scope_migrate_title: "Projekt migrieren",
  project_manager_overlay_scope_migrate_subtitle:
    "Dieses Projekt auf einen neuen Zielpfad verschieben und betroffene Bindungen aktualisieren.",
  project_manager_overlay_replace_global_title: "Globales Ersatzprojekt wählen",
  language_control_title: "VMM-Sprachsteuerung",
  language_control_subtitle:
    "Eine lokale oder globale Sprachüberschreibung für die VMM-Oberfläche wählen.",
  language_control_section_list: "Sprachen",
  language_control_current_effective: "Aktuelle effektive Sprache: {value}",
  language_control_write_scope: "Aktueller Schreibbereich: {scope}",
  language_control_status: "Status",
  language_control_keys_hint: "Tasten: Hoch/Runter wählen, Enter anwenden, Esc zurück.",
  language_control_list_title: "Sprachliste",
  language_control_loading: "Sprachliste wird geladen...",
  language_control_group_actions: "Funktionen",
  language_control_group_languages: "Sprachliste",
  language_control_workspace_summary: "WorkspaceLanguage:{value}",
  language_control_global_summary: "GlobalLanguage:{value}",
  language_control_effective_summary: "Effective:{value}",
  language_control_inherit_global_value: "Global erben",
  language_control_status_loaded: "LanguageCount:{count}",
  language_control_scope_dialog_title: "Wo soll diese Sprache gespeichert werden?",
  language_control_scope_workspace_title: "Aktueller Workspace",
  language_control_scope_workspace_subtitle:
    "Diese Sprache in der aktuellen Workspace-Konfiguration speichern.",
  language_control_scope_global_title: "Globale Konfiguration",
  language_control_scope_global_subtitle:
    "Diese Sprache in der gemeinsamen globalen Konfiguration speichern.",
  language_control_clear_title: "Workspace-Sprache erbt Global",
  language_control_clear_subtitle:
    "Die Workspace-Überschreibung löschen und wieder vom globalen Wert erben.",
  memory_settings_title: "VMM-Speichereinstellungen",
  memory_settings_subtitle: "Zuerst eine Funktion, dann den Schreibbereich wählen.",
  memory_settings_section_list: "Speicher-Steuerungen",
  memory_settings_loading: "Speichereinstellungen werden geladen...",
  memory_settings_scope_dialog_title: "In welchem Bereich soll diese Speichereinstellung gespeichert werden?",
  memory_settings_scope_workspace_title: "Aktueller Workspace",
  memory_settings_scope_workspace_subtitle:
    "Diese Speichereinstellung im aktuellen Workspace speichern.",
  memory_settings_scope_global_title: "Globale Konfiguration",
  memory_settings_scope_global_subtitle:
    "Diese Speichereinstellung in der gemeinsamen globalen Konfiguration speichern.",
  memory_settings_keys_hint:
    "Tasten: Hoch/Runter wählen, Enter fortfahren, Esc/Rechtsklick schließen.",
  memory_settings_inherit_value: "Erben",
  memory_settings_state_pair: "Projekt:{project}|Global:{global}",
  memory_settings_session_compact_enabled_value: "An",
  memory_settings_session_compact_disabled_value: "Aus",
  memory_settings_mode_adjust_title: "Injektionsmodus anpassen",
  memory_settings_mode_adjust_subtitle:
    "Zwischen sichtbarer und impliziter Injektion wechseln.",
  memory_settings_mode_select_title: "Injektionsmodus für {scope} wählen",
  memory_settings_mode_visible_title: "Sichtbarer Injektionsmodus",
  memory_settings_mode_visible_subtitle:
    "Einen Bereich wählen und auf sichtbare Speicherinjektion umstellen.",
  memory_settings_mode_implicit_title: "Impliziter Injektionsmodus",
  memory_settings_mode_implicit_subtitle:
    "Den gewählten Bereich auf implizite Speicherinjektion umstellen.",
  memory_settings_turns_title: "Implizite Turns setzen",
  memory_settings_turns_subtitle:
    "Einen Bereich wählen und seinen implicit_memory_turns-Wert ändern.",
  memory_settings_profile_refresh_title: "Profil-Refresh-Turns setzen",
  memory_settings_profile_refresh_subtitle:
    "Einen Bereich wählen und seinen profile_refresh_turns-Wert ändern.",
  memory_settings_session_compact_adjust_title: "Compact-Recall anpassen",
  memory_settings_session_compact_adjust_subtitle:
    "Compact-aware Recall und Compact-Benachrichtigungen steuern.",
  memory_settings_session_compact_select_title:
    "Compact-Recall-Modus für {scope} wählen",
  memory_settings_session_compact_on_title: "Compact-Recall aktivieren",
  memory_settings_session_compact_on_subtitle:
    "Einen Bereich wählen und compact-aware Recall samt Compact-Benachrichtigungen aktivieren.",
  memory_settings_session_compact_on_detail_1:
    "Wenn aktiviert, verwendet PreCheck den session compact recall mode und der Compact-Hook sendet ChatCompact-Bestätigungen.",
  memory_settings_session_compact_on_detail_2:
    "Nutze dies, damit nach einer Komprimierung der noch lebende unkomprimierte Tail nicht erneut geöffnet wird.",
  memory_settings_session_compact_off_title: "Compact-Recall deaktivieren",
  memory_settings_session_compact_off_subtitle:
    "Einen Bereich wählen und ohne Compact-Benachrichtigungen auf den Legacy-PreCheck zurückfallen.",
  memory_settings_session_compact_off_detail_1:
    "Wenn deaktiviert, benachrichtigt der Compact-Hook VMM nicht und PreCheck bleibt im Legacy-Modus.",
  memory_settings_session_compact_off_detail_2:
    "Nutze dies nur, wenn dieser Host oder Workflow nicht an compact-aware Recall teilnehmen soll.",
  memory_settings_saved_session_compact_on:
    "Compact-aware Recall ist jetzt in {scope} aktiviert.",
  memory_settings_saved_session_compact_off:
    "Compact-aware Recall ist jetzt in {scope} deaktiviert.",
  grpc_transport_section_list: "gRPC-Transportsteuerung",
  grpc_transport_loading: "gRPC-Transporteinstellungen werden geladen...",
  grpc_transport_scope_dialog_title:
    "In welchem Bereich soll diese gRPC-Transporteinstellung gespeichert werden?",
  grpc_transport_scope_workspace_subtitle:
    "Diese gRPC-Transporteinstellung im aktuellen Workspace speichern.",
  grpc_transport_scope_global_subtitle:
    "Diese gRPC-Transporteinstellung in der globalen gemeinsamen Konfiguration speichern.",
  grpc_transport_toast_title: "gRPC-Transporteinstellungen",
  grpc_transport_keepalive_time_title: "Keepalive-Zeit setzen",
  grpc_transport_keepalive_time_subtitle:
    "Einen Bereich wählen und dann grpc_keepalive_time_ms bearbeiten.",
  grpc_transport_keepalive_timeout_title: "Keepalive-Timeout setzen",
  grpc_transport_keepalive_timeout_subtitle:
    "Einen Bereich wählen und dann grpc_keepalive_timeout_ms bearbeiten.",
  grpc_transport_permit_title: "Keepalive ohne Aufrufe anpassen",
  grpc_transport_permit_subtitle:
    "Einen Bereich wählen und dann grpc_keepalive_permit_without_calls umschalten.",
  grpc_transport_save_failed:
    "Die gRPC-Transporteinstellung konnte nicht gespeichert werden. Bitte erneut versuchen.",
  grpc_transport_keepalive_time_prompt_title: "Keepalive-Zeit setzen (ms)",
  grpc_transport_keepalive_time_prompt_placeholder:
    "Positive Ganzzahl in Millisekunden",
  grpc_transport_keepalive_time_prompt_description:
    "grpc_keepalive_time_ms eingeben. Dieser Wert steuert, wie oft eine idle Verbindung einen Keepalive-Ping sendet.",
  grpc_transport_keepalive_time_prompt_empty:
    "Die Keepalive-Zeit darf nicht leer sein.",
  grpc_transport_keepalive_time_prompt_invalid:
    "grpc_keepalive_time_ms muss eine positive Ganzzahl sein.",
  grpc_transport_keepalive_timeout_prompt_title:
    "Keepalive-Timeout setzen (ms)",
  grpc_transport_keepalive_timeout_prompt_placeholder:
    "Positive Ganzzahl in Millisekunden",
  grpc_transport_keepalive_timeout_prompt_description:
    "grpc_keepalive_timeout_ms eingeben. Dieser Wert steuert, wie lange auf ein Keepalive-ACK gewartet wird.",
  grpc_transport_keepalive_timeout_prompt_empty:
    "Das Keepalive-Timeout darf nicht leer sein.",
  grpc_transport_keepalive_timeout_prompt_invalid:
    "grpc_keepalive_timeout_ms muss eine positive Ganzzahl sein.",
  grpc_transport_keepalive_timeout_exceeds_time:
    "Die Keepalive-Timeout muss kleiner als die Keepalive-Zeit sein.",
  grpc_transport_keepalive_time_below_timeout:
    "Die Keepalive-Zeit darf nicht kleiner als die aktuelle Timeout sein.",
  grpc_transport_permit_select_title:
    "Verhalten ohne Aufrufe für {scope} wählen",
  grpc_transport_permit_disabled_title:
    "Idle-Pings ohne Aufrufe deaktivieren",
  grpc_transport_permit_disabled_subtitle:
    "Keepalive nur erlauben, wenn aktive RPC-Aufrufe existieren.",
  grpc_transport_permit_enabled_title:
    "Idle-Pings ohne Aufrufe aktivieren",
  grpc_transport_permit_enabled_subtitle:
    "Keepalive auch dann erlauben, wenn kein aktiver RPC-Aufruf existiert.",
  grpc_transport_saved_keepalive_time:
    "Die Keepalive-Zeit in {scope} beträgt jetzt {value} ms.",
  grpc_transport_saved_keepalive_timeout:
    "Das Keepalive-Timeout in {scope} beträgt jetzt {value} ms.",
  grpc_transport_saved_permit_on:
    "Keepalive ohne Aufrufe ist jetzt in {scope} aktiviert.",
  grpc_transport_saved_permit_off:
    "Keepalive ohne Aufrufe ist jetzt in {scope} deaktiviert.",
  profile_center_title: "VMM-Profilzentrum",
  profile_center_subtitle:
    "Ein Profilziel wählen, Knoten prüfen oder eine manuelle Anweisung ergänzen.",
  profile_center_section_actions: "Aktionen",
  profile_center_section_nodes: "Tabelle aktiver Knoten",
  profile_center_loading: "Profilknoten werden geladen...",
  profile_center_loaded_nodes: "{count} aktive Profilknoten geladen.",
  profile_center_launcher_title: "Profilzentrum",
  profile_center_launcher_subtitle:
    "Zuerst ein Profilziel wählen und dann den zugehörigen Arbeitsbereich öffnen.",
  profile_center_launcher_hint:
    "Tasten: Hoch/Runter Ziel wählen, Enter öffnen, Esc/Rechtsklick zurück.",
  profile_center_launcher_status_idle: "Ein Profilziel zum Start wählen.",
  profile_center_workspace_header: "{value}-Profilarbeitsbereich",
  profile_center_workspace_hint:
    "Tasten: Links/Rechts Aktionen, Hoch/Runter Knoten, Enter prüfen oder ausführen, Esc/Rechtsklick zurück.",
  profile_center_filter_placeholder:
    "Profilknoten nach Inhalt, Quelle, ID oder Datum filtern...",
  profile_center_details_title: "Details des Profilknotens",
  profile_center_details_hint:
    "Oben einen Knoten auswählen, um unten die vollständigen Detailtabellen zu sehen.",
  profile_center_details_meta_title: "Strukturierte Felder",
  profile_target_user_launcher: "Benutzerprofil",
  profile_target_project_launcher: "Projektprofil",
  profile_target_space_launcher: "Space-Profil",
  profile_target_team_launcher: "Team-Profil",
  profile_detail_field_node_id: "Knoten-ID",
  profile_detail_field_target: "Ziel",
  profile_detail_field_bind_id: "Bindungs-ID",
  profile_detail_field_priority: "Priorität",
  profile_detail_field_level: "Level",
  profile_detail_field_refresh_weight: "Refresh-Gewicht",
  profile_detail_field_profile_date: "Profildatum",
  profile_detail_field_expires: "Läuft ab",
  profile_detail_field_source: "Quelle",
  profile_detail_field_source_id: "Quell-ID",
  profile_detail_field_content: "Profildetail",
  profile_detail_field_reason: "Level-Grund",
  profile_target_user: "Benutzer",
  profile_target_project: "Projekt",
  profile_target_team: "Team",
  profile_target_space: "Space",
  profile_table_scope: "Ziel",
  profile_table_expires: "Läuft ab",
  profile_table_source: "Quelle",
  profile_table_content: "Detail",
  scope_local_title: "Schreibbereich: Workspace",
  scope_global_title: "Schreibbereich: Global",
  scope_selected_subtitle: "{scope} ist der aktuelle Schreibbereich.",
  scope_switch_subtitle: "Den aktuellen Schreibbereich auf {scope} umstellen.",
  scope_detail_selected: "{scope} ist bereits als Schreibbereich gewählt.",
  scope_detail_switch: "Damit wird die nächste Änderung in {scope} gespeichert.",
  back_setting_title: "Zurück zum Kontrollpanel",
  back_setting_subtitle: "Zurück zur Funktionsliste.",
  back_setting_detail_1: "Zum übergeordneten Einstellungszentrum zurückkehren.",
  back_setting_detail_2: "Dadurch bleibt der Workflow listen- und fensterbasiert.",
})

/**
 * Japanese supplemental translations for overlay-first TUI surfaces.
 * 面向覆盖层主流程 TUI 界面的日语补充翻译。
 */
Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.ja, {
  setting_home_filter_placeholder: "英語のコマンド名で素早く絞り込み...",
  setting_home_list_title: "コマンド一覧",
  setting_home_empty: "この条件に一致するコマンドはありません。",
  setting_home_keys_hint: "入力で絞り込み | ↑↓/j/k 移動 | Enter 開く | Esc クリア/戻る",
  setting_home_status_user: "現在ユーザー",
  setting_home_status_project: "現在プロジェクト",
  setting_home_status_language: "言語",
  setting_home_status_mode: "モード",
  setting_home_status_turns: "ターン数",
  setting_home_status_compact: "圧縮",
  setting_home_mode_visible: "表示",
  setting_home_mode_implicit: "暗黙",
  selector_scope_title: "書き込み範囲",
  selector_target_title: "対象",
  dialog_select_keys_hint: "↑↓ 選択 | Enter 確認 | Esc/右クリック 取消",
  setting_menu_project_manager_subtitle: "VMM プロジェクトの一覧、作成、切り替え。",
  setting_menu_project_manager_detail_1: "専用のプロジェクト管理ウィンドウを開きます。",
  setting_menu_project_manager_detail_2: "ウィンドウは VMM から live プロジェクト一覧を取得します。",
  setting_menu_project_manager_detail_3:
    "既存プロジェクトのバインド、または標準 Team/Space/Project パスの作成ができます。",
  setting_menu_project_manager_detail_4:
    "プロジェクト管理は workspace と global の両方を扱えます。",
  setting_menu_profile_center_subtitle: "active な VMM 画像ノードを確認して編集します。",
  setting_menu_profile_center_detail_1:
    "user、project、team、space の画像対象を切り替えます。",
  setting_menu_profile_center_detail_2:
    "同じ画面で active ノードを更新したり手動指令を追加したりできます。",
  setting_menu_profile_center_detail_3:
    "画像読み取りは backend の最大スライスで取得します。",
  setting_menu_profile_bundle_test_subtitle: "現在のバインドで完全な画像 bundle を読み取ります。",
  setting_menu_profile_bundle_test_detail_1:
    "新しい full bundle RPC を検証するための独立したテスト導線です。",
  setting_menu_profile_bundle_test_detail_2:
    "このパネルはテスト専用で、通常の画像中心には統合しません。",
  setting_menu_language_subtitle: "VMM UI 言語のローカル/グローバル上書きを設定します。",
  setting_menu_language_detail_1:
    "対応言語を選ぶか、現在のスコープ上書きをクリアします。",
  setting_menu_language_detail_2:
    "TUI ウィンドウは保存後すぐに新しい有効言語へ切り替わります。",
  setting_menu_language_detail_3:
    "コマンドパレットの説明は OpenCode の再起動後に更新されます。",
  setting_menu_memory_subtitle:
    "表示/暗黙モード、暗黙ターン数、画像更新ターン数、圧縮感知リコールを設定します。",
  setting_menu_memory_detail_1: "表示メモリ注入と暗黙メモリ注入を切り替えます。",
  setting_menu_memory_detail_2:
    "同じ画面で implicit_memory_turns、profile_refresh_turns、圧縮感知リコールを調整します。",
  setting_menu_memory_detail_3:
    "ここでも workspace と global の両方をサポートします。",
  setting_menu_grpc_transport_title: "gRPC トランスポート",
  setting_menu_grpc_transport_subtitle:
    "keepalive 時間、timeout、アイドル ping 戦略を設定します。",
  setting_menu_grpc_transport_detail_1:
    "grpc_keepalive_time_ms を調整して、idle 接続が健全性 ping を送る間隔を制御します。",
  setting_menu_grpc_transport_detail_2:
    "grpc_keepalive_timeout_ms を調整して、keepalive ACK の待機時間を制御します。",
  setting_menu_grpc_transport_detail_3:
    "grpc_keepalive_permit_without_calls を切り替えて、アクティブ RPC がないときの keepalive 可否を制御します。",
  user_manager_overlay_scope_dialog_title: "このユーザーをどこに保存しますか",
  user_manager_overlay_scope_workspace_title: "現在のワークスペース",
  user_manager_overlay_scope_workspace_subtitle:
    "このユーザーを現在のワークスペース設定に保存します。",
  user_manager_overlay_scope_global_title: "グローバル設定",
  user_manager_overlay_scope_global_subtitle:
    "このユーザーを共有グローバル設定に保存します。",
  user_manager_overlay_scope_delete_title: "アカウントを削除",
  user_manager_overlay_scope_delete_subtitle:
    "確認後、このアカウントと関連データを削除します。",
  user_manager_overlay_replace_global_title: "代替グローバルユーザーを選択",
  project_manager_overlay_scope_dialog_title: "このプロジェクトをどこに保存しますか",
  project_manager_overlay_scope_workspace_title: "現在のワークスペース",
  project_manager_overlay_scope_workspace_subtitle:
    "このプロジェクトを現在のワークスペース設定に保存します。",
  project_manager_overlay_scope_global_title: "グローバル設定",
  project_manager_overlay_scope_global_subtitle:
    "このプロジェクトを共有グローバル設定に保存します。",
  project_manager_overlay_scope_delete_title: "プロジェクトを削除",
  project_manager_overlay_scope_delete_subtitle:
    "完全なパス確認後にこのプロジェクトを削除します。",
  project_manager_overlay_scope_migrate_title: "プロジェクトを移行",
  project_manager_overlay_scope_migrate_subtitle:
    "このプロジェクトを新しい目標パスへ移し、影響を受けるバインドも更新します。",
  project_manager_overlay_replace_global_title: "代替グローバルプロジェクトを選択",
  language_control_title: "VMM 言語コントロール",
  language_control_subtitle:
    "VMM UI 言語のローカルまたはグローバル上書きを選択します。",
  language_control_section_list: "言語一覧",
  language_control_current_effective: "現在有効な言語: {value}",
  language_control_write_scope: "現在の書き込み範囲: {scope}",
  language_control_status: "状態",
  language_control_keys_hint: "キー: 上下で選択、Enter で適用、Esc で戻る。",
  language_control_list_title: "言語一覧",
  language_control_loading: "言語一覧を読み込み中...",
  language_control_group_actions: "機能",
  language_control_group_languages: "言語一覧",
  language_control_workspace_summary: "WorkspaceLanguage:{value}",
  language_control_global_summary: "GlobalLanguage:{value}",
  language_control_effective_summary: "Effective:{value}",
  language_control_inherit_global_value: "グローバルを継承",
  language_control_status_loaded: "LanguageCount:{count}",
  language_control_scope_dialog_title: "この言語をどこに保存しますか",
  language_control_scope_workspace_title: "現在のワークスペース",
  language_control_scope_workspace_subtitle:
    "この言語を現在のワークスペース設定に保存します。",
  language_control_scope_global_title: "グローバル設定",
  language_control_scope_global_subtitle:
    "この言語を共有グローバル設定に保存します。",
  language_control_clear_title: "ワークスペース言語をグローバル継承にする",
  language_control_clear_subtitle:
    "ワークスペース上書きを消してグローバル値を再継承します。",
  memory_settings_title: "VMM 記憶設定",
  memory_settings_subtitle: "先に機能を選び、その後で書き込み範囲を選びます。",
  memory_settings_section_list: "記憶コントロール",
  memory_settings_loading: "記憶設定を読み込み中...",
  memory_settings_scope_dialog_title: "この記憶設定をどこに保存しますか",
  memory_settings_scope_workspace_title: "現在のワークスペース",
  memory_settings_scope_workspace_subtitle:
    "この記憶設定を現在のワークスペースに保存します。",
  memory_settings_scope_global_title: "グローバル設定",
  memory_settings_scope_global_subtitle:
    "この記憶設定を共有グローバル設定に保存します。",
  memory_settings_keys_hint:
    "キー: 上下で選択、Enter で次へ進む、Esc/右クリックで閉じる。",
  memory_settings_inherit_value: "継承",
  memory_settings_state_pair: "プロジェクト:{project}|グローバル:{global}",
  memory_settings_session_compact_enabled_value: "オン",
  memory_settings_session_compact_disabled_value: "オフ",
  memory_settings_mode_adjust_title: "注入モードを調整",
  memory_settings_mode_adjust_subtitle:
    "表示注入と暗黙注入を切り替えます。",
  memory_settings_mode_select_title: "{scope} の注入モードを選択",
  memory_settings_mode_visible_title: "表示注入モード",
  memory_settings_mode_visible_subtitle:
    "範囲を選び、その範囲を表示メモリ注入に切り替えます。",
  memory_settings_mode_implicit_title: "暗黙注入モード",
  memory_settings_mode_implicit_subtitle:
    "選択した範囲を暗黙メモリ注入に切り替えます。",
  memory_settings_turns_title: "暗黙ターン数を設定",
  memory_settings_turns_subtitle:
    "範囲を選び、その implicit_memory_turns 値を編集します。",
  memory_settings_profile_refresh_title: "画像更新ターン数を設定",
  memory_settings_profile_refresh_subtitle:
    "範囲を選び、その profile_refresh_turns 値を編集します。",
  memory_settings_session_compact_adjust_title: "圧縮感知リコールを調整",
  memory_settings_session_compact_adjust_subtitle:
    "compact-aware recall と compact 通知を制御します。",
  memory_settings_session_compact_select_title:
    "{scope} の圧縮感知リコールを選択",
  memory_settings_session_compact_on_title: "圧縮感知リコールを有効化",
  memory_settings_session_compact_on_subtitle:
    "範囲を選んで compact-aware recall と compact 通知を有効にします。",
  memory_settings_session_compact_on_detail_1:
    "有効時は PreCheck が session compact recall mode を使い、compact hook が ChatCompact 確認を送信します。",
  memory_settings_session_compact_on_detail_2:
    "圧縮後に、まだ生きている未圧縮テールを再度開かないようにしたい場合に使います。",
  memory_settings_session_compact_off_title: "圧縮感知リコールを無効化",
  memory_settings_session_compact_off_subtitle:
    "範囲を選んで compact 通知なしの legacy PreCheck に戻します。",
  memory_settings_session_compact_off_detail_1:
    "無効時は compact hook が VMM に通知せず、PreCheck も legacy モードを維持します。",
  memory_settings_session_compact_off_detail_2:
    "このホストやワークフローが compact-aware recall に参加すべきでない場合のみ使ってください。",
  memory_settings_saved_session_compact_on:
    "{scope} で圧縮感知リコールを有効にしました。",
  memory_settings_saved_session_compact_off:
    "{scope} で圧縮感知リコールを無効にしました。",
  grpc_transport_section_list: "gRPC トランスポート制御",
  grpc_transport_loading: "gRPC トランスポート設定を読み込み中...",
  grpc_transport_scope_dialog_title:
    "この gRPC トランスポート設定をどこに保存しますか",
  grpc_transport_scope_workspace_subtitle:
    "この gRPC トランスポート設定を現在のワークスペースに保存します。",
  grpc_transport_scope_global_subtitle:
    "この gRPC トランスポート設定を共有グローバル設定に保存します。",
  grpc_transport_toast_title: "gRPC トランスポート設定",
  grpc_transport_keepalive_time_title: "Keepalive 時間を設定",
  grpc_transport_keepalive_time_subtitle:
    "範囲を選び、その後 grpc_keepalive_time_ms を編集します。",
  grpc_transport_keepalive_timeout_title: "Keepalive timeout を設定",
  grpc_transport_keepalive_timeout_subtitle:
    "範囲を選び、その後 grpc_keepalive_timeout_ms を編集します。",
  grpc_transport_permit_title: "無呼び出し keepalive を調整",
  grpc_transport_permit_subtitle:
    "範囲を選び、その後 grpc_keepalive_permit_without_calls を切り替えます。",
  grpc_transport_save_failed:
    "gRPC トランスポート設定の保存に失敗しました。もう一度お試しください。",
  grpc_transport_keepalive_time_prompt_title:
    "Keepalive 時間を設定 (ms)",
  grpc_transport_keepalive_time_prompt_placeholder:
    "正の整数ミリ秒",
  grpc_transport_keepalive_time_prompt_description:
    "grpc_keepalive_time_ms を入力します。idle 接続が keepalive ping を送る間隔を制御します。",
  grpc_transport_keepalive_time_prompt_empty:
    "keepalive 時間は空にできません。",
  grpc_transport_keepalive_time_prompt_invalid:
    "grpc_keepalive_time_ms は正の整数である必要があります。",
  grpc_transport_keepalive_timeout_prompt_title:
    "Keepalive timeout を設定 (ms)",
  grpc_transport_keepalive_timeout_prompt_placeholder:
    "正の整数ミリ秒",
  grpc_transport_keepalive_timeout_prompt_description:
    "grpc_keepalive_timeout_ms を入力します。keepalive ACK の待機時間を制御します。",
  grpc_transport_keepalive_timeout_prompt_empty:
    "keepalive timeout は空にできません。",
  grpc_transport_keepalive_timeout_prompt_invalid:
    "grpc_keepalive_timeout_ms は正の整数である必要があります。",
  grpc_transport_keepalive_timeout_exceeds_time:
    "keepalive timeout は keepalive time より小さい必要があります。",
  grpc_transport_keepalive_time_below_timeout:
    "keepalive time は現在の timeout より小さくできません。",
  grpc_transport_permit_select_title:
    "{scope} の無呼び出し keepalive 動作を選択",
  grpc_transport_permit_disabled_title:
    "無呼び出し時の idle ping を無効化",
  grpc_transport_permit_disabled_subtitle:
    "アクティブ RPC が存在するときだけ keepalive を許可します。",
  grpc_transport_permit_enabled_title:
    "無呼び出し時の idle ping を有効化",
  grpc_transport_permit_enabled_subtitle:
    "アクティブ RPC がなくても keepalive を許可します。",
  grpc_transport_saved_keepalive_time:
    "{scope} の keepalive 時間を {value} ms に設定しました。",
  grpc_transport_saved_keepalive_timeout:
    "{scope} の keepalive timeout を {value} ms に設定しました。",
  grpc_transport_saved_permit_on:
    "{scope} で無呼び出し keepalive を有効にしました。",
  grpc_transport_saved_permit_off:
    "{scope} で無呼び出し keepalive を無効にしました。",
  profile_center_title: "VMM 画像中心",
  profile_center_subtitle: "画像対象を選び、ノードを確認し、手動指令を追加します。",
  profile_center_section_actions: "アクション",
  profile_center_section_nodes: "active ノード表",
  profile_center_loading: "画像ノードを読み込み中...",
  profile_center_loaded_nodes: "{count} 件の active 画像ノードを読み込みました。",
  profile_center_launcher_title: "画像中心",
  profile_center_launcher_subtitle:
    "先に画像対象を選び、その後対応する作業画面を開きます。",
  profile_center_launcher_hint:
    "キー: 上下で対象選択、Enter で開く、Esc/右クリックで戻る。",
  profile_center_launcher_status_idle: "画像対象を選んで開始してください。",
  profile_center_workspace_header: "{value}画像作業区",
  profile_center_workspace_hint:
    "キー: 左右で操作、上下でノード、Enter で確認/実行、Esc/右クリックで戻る。",
  profile_center_filter_placeholder: "内容、ソース、ID、日付で画像ノードを絞り込み...",
  profile_center_details_title: "画像ノード詳細",
  profile_center_details_hint:
    "上のノードを選ぶと、下に完全な詳細テーブルが表示されます。",
  profile_center_details_meta_title: "構造化フィールド",
  profile_target_user_launcher: "ユーザー画像",
  profile_target_project_launcher: "プロジェクト画像",
  profile_target_space_launcher: "空間画像",
  profile_target_team_launcher: "チーム画像",
  profile_detail_field_node_id: "ノード ID",
  profile_detail_field_target: "対象",
  profile_detail_field_bind_id: "バインド ID",
  profile_detail_field_priority: "優先度",
  profile_detail_field_level: "レベル",
  profile_detail_field_refresh_weight: "更新重み",
  profile_detail_field_profile_date: "画像日付",
  profile_detail_field_expires: "期限",
  profile_detail_field_source: "ソース",
  profile_detail_field_source_id: "ソース ID",
  profile_detail_field_content: "画像詳細",
  profile_detail_field_reason: "レベル理由",
  profile_target_user: "ユーザー",
  profile_target_project: "プロジェクト",
  profile_target_team: "チーム",
  profile_target_space: "空間",
  profile_table_scope: "対象",
  profile_table_expires: "期限",
  profile_table_source: "ソース",
  profile_table_content: "画像詳細",
  scope_local_title: "書き込み範囲: ワークスペース",
  scope_global_title: "書き込み範囲: グローバル",
  scope_selected_subtitle: "{scope} が現在の書き込み範囲です。",
  scope_switch_subtitle: "現在の書き込み範囲を {scope} に切り替えます。",
  scope_detail_selected: "{scope} はすでに現在の書き込み範囲です。",
  scope_detail_switch: "次の変更は {scope} に保存されます。",
  back_setting_title: "コントロールパネルへ戻る",
  back_setting_subtitle: "機能一覧へ戻ります。",
  back_setting_detail_1: "トップレベルの設定センターへ戻ります。",
  back_setting_detail_2: "これで一覧中心・ウィンドウ中心の流れを保てます。",
})

/**
 * Korean supplemental translations for overlay-first TUI surfaces.
 * 面向覆盖层主流程 TUI 界面的韩语补充翻译。
 */
Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.ko, {
  setting_home_filter_placeholder: "영문 명령 이름으로 빠르게 필터...",
  setting_home_list_title: "명령 목록",
  setting_home_empty: "이 필터에 맞는 명령이 없습니다.",
  setting_home_keys_hint: "입력해서 필터 | ↑↓/j/k 이동 | Enter 열기 | Esc 지우기/뒤로",
  setting_home_status_user: "현재 사용자",
  setting_home_status_project: "현재 프로젝트",
  setting_home_status_language: "언어",
  setting_home_status_mode: "모드",
  setting_home_status_turns: "턴",
  setting_home_status_compact: "압축",
  setting_home_mode_visible: "표시",
  setting_home_mode_implicit: "암묵",
  selector_scope_title: "쓰기 범위",
  selector_target_title: "대상",
  dialog_select_keys_hint: "↑↓ 선택 | Enter 확인 | Esc/오른쪽 클릭 취소",
  setting_menu_project_manager_subtitle: "VMM 프로젝트 목록, 생성, 전환.",
  setting_menu_project_manager_detail_1: "전용 프로젝트 제어 창을 엽니다.",
  setting_menu_project_manager_detail_2: "창은 VMM 에서 live 프로젝트 목록을 가져옵니다.",
  setting_menu_project_manager_detail_3:
    "기존 프로젝트를 바인드하거나 표준 Team/Space/Project 경로를 만들 수 있습니다.",
  setting_menu_project_manager_detail_4:
    "프로젝트 관리는 workspace 와 global 범위를 모두 지원합니다.",
  setting_menu_profile_center_subtitle: "활성 VMM 프로필 노드를 확인하고 수정합니다.",
  setting_menu_profile_center_detail_1:
    "user, project, team, space 프로필 대상을 전환합니다.",
  setting_menu_profile_center_detail_2:
    "같은 창에서 active 노드를 새로고치거나 수동 지시를 추가할 수 있습니다.",
  setting_menu_profile_center_detail_3:
    "프로필 조회는 backend 가 허용한 최대 슬라이스를 요청합니다.",
  setting_menu_profile_bundle_test_subtitle:
    "현재 바인딩 기준의 전체 프로필 bundle 을 읽습니다.",
  setting_menu_profile_bundle_test_detail_1:
    "새 full bundle RPC 를 검증하기 위한 독립 테스트 흐름입니다.",
  setting_menu_profile_bundle_test_detail_2:
    "이 패널은 테스트 전용이며 기본 프로필 센터와 분리되어 있습니다.",
  setting_menu_language_subtitle: "VMM UI 언어의 로컬/전역 오버라이드를 설정합니다.",
  setting_menu_language_detail_1:
    "지원 언어를 선택하거나 현재 범위의 오버라이드를 비웁니다.",
  setting_menu_language_detail_2:
    "TUI 창은 저장 직후 새 유효 언어로 전환됩니다.",
  setting_menu_language_detail_3:
    "명령 팔레트 설명은 OpenCode 재시작 후에 갱신됩니다.",
  setting_menu_memory_subtitle:
    "표시/암묵 모드, 암묵 턴 수, 프로필 새로고침 턴 수, 압축 인지 리콜을 설정합니다.",
  setting_menu_memory_detail_1:
    "표시 메모리 주입과 암묵 메모리 주입 사이를 전환합니다.",
  setting_menu_memory_detail_2:
    "같은 창에서 implicit_memory_turns, profile_refresh_turns, 압축 인지 리콜을 조정합니다.",
  setting_menu_memory_detail_3: "이 화면도 workspace 와 global 을 모두 지원합니다.",
  setting_menu_grpc_transport_title: "gRPC 전송",
  setting_menu_grpc_transport_subtitle:
    "keepalive 시간, timeout, idle ping 전략을 설정합니다.",
  setting_menu_grpc_transport_detail_1:
    "grpc_keepalive_time_ms 를 조정해 idle 연결의 헬스 ping 주기를 제어합니다.",
  setting_menu_grpc_transport_detail_2:
    "grpc_keepalive_timeout_ms 를 조정해 keepalive ACK 대기 시간을 제어합니다.",
  setting_menu_grpc_transport_detail_3:
    "grpc_keepalive_permit_without_calls 를 전환해 활성 RPC 가 없을 때 keepalive 허용 여부를 제어합니다.",
  user_manager_overlay_scope_dialog_title: "이 사용자를 어디에 저장할까요",
  user_manager_overlay_scope_workspace_title: "현재 워크스페이스",
  user_manager_overlay_scope_workspace_subtitle:
    "이 사용자를 현재 워크스페이스 설정에 저장합니다.",
  user_manager_overlay_scope_global_title: "전역 설정",
  user_manager_overlay_scope_global_subtitle:
    "이 사용자를 공유 전역 설정에 저장합니다.",
  user_manager_overlay_scope_delete_title: "계정 삭제",
  user_manager_overlay_scope_delete_subtitle:
    "확인 후 이 계정과 관련 데이터를 삭제합니다.",
  user_manager_overlay_replace_global_title: "대체 전역 사용자 선택",
  project_manager_overlay_scope_dialog_title: "이 프로젝트를 어디에 저장할까요",
  project_manager_overlay_scope_workspace_title: "현재 워크스페이스",
  project_manager_overlay_scope_workspace_subtitle:
    "이 프로젝트를 현재 워크스페이스 설정에 저장합니다.",
  project_manager_overlay_scope_global_title: "전역 설정",
  project_manager_overlay_scope_global_subtitle:
    "이 프로젝트를 공유 전역 설정에 저장합니다.",
  project_manager_overlay_scope_delete_title: "프로젝트 삭제",
  project_manager_overlay_scope_delete_subtitle:
    "전체 경로 확인 후 이 프로젝트를 삭제합니다.",
  project_manager_overlay_scope_migrate_title: "프로젝트 이전",
  project_manager_overlay_scope_migrate_subtitle:
    "이 프로젝트를 새 목표 경로로 옮기고 영향받는 바인딩을 함께 갱신합니다.",
  project_manager_overlay_replace_global_title: "대체 전역 프로젝트 선택",
  language_control_title: "VMM 언어 제어",
  language_control_subtitle:
    "VMM UI 언어의 로컬 또는 전역 오버라이드를 선택합니다.",
  language_control_section_list: "언어",
  language_control_current_effective: "현재 유효 언어: {value}",
  language_control_write_scope: "현재 쓰기 범위: {scope}",
  language_control_status: "상태",
  language_control_keys_hint: "키: 위/아래 선택, Enter 적용, Esc 돌아가기.",
  language_control_list_title: "언어 목록",
  language_control_loading: "언어 목록을 불러오는 중...",
  language_control_group_actions: "기능",
  language_control_group_languages: "언어 목록",
  language_control_workspace_summary: "WorkspaceLanguage:{value}",
  language_control_global_summary: "GlobalLanguage:{value}",
  language_control_effective_summary: "Effective:{value}",
  language_control_inherit_global_value: "전역 상속",
  language_control_status_loaded: "LanguageCount:{count}",
  language_control_scope_dialog_title: "이 언어를 어디에 저장할까요",
  language_control_scope_workspace_title: "현재 워크스페이스",
  language_control_scope_workspace_subtitle:
    "이 언어를 현재 워크스페이스 설정에 저장합니다.",
  language_control_scope_global_title: "전역 설정",
  language_control_scope_global_subtitle:
    "이 언어를 공유 전역 설정에 저장합니다.",
  language_control_clear_title: "워크스페이스 언어를 전역 상속으로 전환",
  language_control_clear_subtitle:
    "워크스페이스 오버라이드를 지우고 전역 값을 다시 상속합니다.",
  memory_settings_title: "VMM 메모리 설정",
  memory_settings_subtitle: "먼저 기능을 선택한 뒤 쓰기 범위를 선택합니다.",
  memory_settings_section_list: "메모리 제어",
  memory_settings_loading: "메모리 설정을 불러오는 중...",
  memory_settings_scope_dialog_title: "이 메모리 설정을 어디에 저장할까요",
  memory_settings_scope_workspace_title: "현재 워크스페이스",
  memory_settings_scope_workspace_subtitle:
    "이 메모리 설정을 현재 워크스페이스에 저장합니다.",
  memory_settings_scope_global_title: "전역 설정",
  memory_settings_scope_global_subtitle:
    "이 메모리 설정을 공유 전역 설정에 저장합니다.",
  memory_settings_keys_hint:
    "키: 위/아래 선택, Enter 다음 단계, Esc/오른쪽 클릭 닫기.",
  memory_settings_inherit_value: "상속",
  memory_settings_state_pair: "프로젝트:{project}|전역:{global}",
  memory_settings_session_compact_enabled_value: "켜짐",
  memory_settings_session_compact_disabled_value: "꺼짐",
  memory_settings_mode_adjust_title: "주입 모드 조정",
  memory_settings_mode_adjust_subtitle:
    "표시 주입과 암묵 주입 사이를 전환합니다.",
  memory_settings_mode_select_title: "{scope}용 주입 모드 선택",
  memory_settings_mode_visible_title: "표시 주입 모드",
  memory_settings_mode_visible_subtitle:
    "범위를 선택한 뒤 표시 메모리 주입으로 전환합니다.",
  memory_settings_mode_implicit_title: "암묵 주입 모드",
  memory_settings_mode_implicit_subtitle:
    "선택한 범위를 암묵 메모리 주입으로 전환합니다.",
  memory_settings_turns_title: "암묵 턴 수 설정",
  memory_settings_turns_subtitle:
    "범위를 선택한 뒤 implicit_memory_turns 값을 수정합니다.",
  memory_settings_profile_refresh_title: "프로필 새로고침 턴 수 설정",
  memory_settings_profile_refresh_subtitle:
    "범위를 선택한 뒤 profile_refresh_turns 값을 수정합니다.",
  memory_settings_session_compact_adjust_title: "압축 인지 리콜 조정",
  memory_settings_session_compact_adjust_subtitle:
    "compact-aware recall 과 compact 알림을 제어합니다.",
  memory_settings_session_compact_select_title:
    "{scope}용 압축 인지 리콜 모드 선택",
  memory_settings_session_compact_on_title: "압축 인지 리콜 활성화",
  memory_settings_session_compact_on_subtitle:
    "범위를 선택한 뒤 compact-aware recall 과 compact 알림을 활성화합니다.",
  memory_settings_session_compact_on_detail_1:
    "활성화되면 PreCheck 는 session compact recall mode 를 사용하고 compact hook 이 ChatCompact 확인을 전송합니다.",
  memory_settings_session_compact_on_detail_2:
    "압축 뒤 아직 살아 있는 미압축 tail 을 다시 열지 않게 하려면 사용하세요.",
  memory_settings_session_compact_off_title: "압축 인지 리콜 비활성화",
  memory_settings_session_compact_off_subtitle:
    "범위를 선택한 뒤 compact 알림 없이 legacy PreCheck 로 되돌립니다.",
  memory_settings_session_compact_off_detail_1:
    "비활성화되면 compact hook 이 VMM 에 알리지 않고 PreCheck 도 legacy 모드를 유지합니다.",
  memory_settings_session_compact_off_detail_2:
    "이 호스트나 워크플로가 compact-aware recall 에 참여하면 안 되는 경우에만 사용하세요.",
  memory_settings_saved_session_compact_on:
    "{scope} 범위에서 압축 인지 리콜을 활성화했습니다.",
  memory_settings_saved_session_compact_off:
    "{scope} 범위에서 압축 인지 리콜을 비활성화했습니다.",
  grpc_transport_section_list: "gRPC 전송 제어",
  grpc_transport_loading: "gRPC 전송 설정을 불러오는 중...",
  grpc_transport_scope_dialog_title:
    "이 gRPC 전송 설정을 어디에 저장할까요",
  grpc_transport_scope_workspace_subtitle:
    "이 gRPC 전송 설정을 현재 워크스페이스에 저장합니다.",
  grpc_transport_scope_global_subtitle:
    "이 gRPC 전송 설정을 공유 전역 설정에 저장합니다.",
  grpc_transport_toast_title: "gRPC 전송 설정",
  grpc_transport_keepalive_time_title: "Keepalive 시간 설정",
  grpc_transport_keepalive_time_subtitle:
    "범위를 선택한 뒤 grpc_keepalive_time_ms 를 편집합니다.",
  grpc_transport_keepalive_timeout_title: "Keepalive timeout 설정",
  grpc_transport_keepalive_timeout_subtitle:
    "범위를 선택한 뒤 grpc_keepalive_timeout_ms 를 편집합니다.",
  grpc_transport_permit_title: "무호출 keepalive 조정",
  grpc_transport_permit_subtitle:
    "범위를 선택한 뒤 grpc_keepalive_permit_without_calls 를 전환합니다.",
  grpc_transport_save_failed:
    "gRPC 전송 설정을 저장하지 못했습니다. 다시 시도해주세요.",
  grpc_transport_keepalive_time_prompt_title: "Keepalive 시간 설정 (ms)",
  grpc_transport_keepalive_time_prompt_placeholder:
    "양의 정수 밀리초",
  grpc_transport_keepalive_time_prompt_description:
    "grpc_keepalive_time_ms 를 입력하세요. idle 연결이 keepalive ping 을 보내는 주기를 제어합니다.",
  grpc_transport_keepalive_time_prompt_empty:
    "keepalive 시간은 비워 둘 수 없습니다.",
  grpc_transport_keepalive_time_prompt_invalid:
    "grpc_keepalive_time_ms 는 양의 정수여야 합니다.",
  grpc_transport_keepalive_timeout_prompt_title:
    "Keepalive timeout 설정 (ms)",
  grpc_transport_keepalive_timeout_prompt_placeholder:
    "양의 정수 밀리초",
  grpc_transport_keepalive_timeout_prompt_description:
    "grpc_keepalive_timeout_ms 를 입력하세요. keepalive ACK 대기 시간을 제어합니다.",
  grpc_transport_keepalive_timeout_prompt_empty:
    "keepalive timeout 은 비워 둘 수 없습니다.",
  grpc_transport_keepalive_timeout_prompt_invalid:
    "grpc_keepalive_timeout_ms 는 양의 정수여야 합니다.",
  grpc_transport_keepalive_timeout_exceeds_time:
    "keepalive timeout 은 keepalive time 보다 작아야 합니다.",
  grpc_transport_keepalive_time_below_timeout:
    "keepalive time 은 현재 timeout 보다 작을 수 없습니다.",
  grpc_transport_permit_select_title:
    "{scope} 용 무호출 keepalive 동작 선택",
  grpc_transport_permit_disabled_title:
    "무호출 idle ping 비활성화",
  grpc_transport_permit_disabled_subtitle:
    "활성 RPC 가 있을 때만 keepalive 를 허용합니다.",
  grpc_transport_permit_enabled_title:
    "무호출 idle ping 활성화",
  grpc_transport_permit_enabled_subtitle:
    "활성 RPC 가 없어도 keepalive 를 허용합니다.",
  grpc_transport_saved_keepalive_time:
    "{scope} keepalive 시간을 {value} ms 로 설정했습니다.",
  grpc_transport_saved_keepalive_timeout:
    "{scope} keepalive timeout 을 {value} ms 로 설정했습니다.",
  grpc_transport_saved_permit_on:
    "{scope} 에서 무호출 keepalive 를 활성화했습니다.",
  grpc_transport_saved_permit_off:
    "{scope} 에서 무호출 keepalive 를 비활성화했습니다.",
  profile_center_title: "VMM 프로필 센터",
  profile_center_subtitle: "프로필 대상을 선택하고 노드를 확인하거나 수동 지시를 추가합니다.",
  profile_center_section_actions: "동작",
  profile_center_section_nodes: "활성 노드 표",
  profile_center_loading: "프로필 노드를 불러오는 중...",
  profile_center_loaded_nodes: "활성 프로필 노드 {count}개를 불러왔습니다.",
  profile_center_launcher_title: "프로필 센터",
  profile_center_launcher_subtitle:
    "먼저 프로필 대상을 선택한 뒤 해당 작업 공간을 엽니다.",
  profile_center_launcher_hint:
    "키: 위/아래 대상 선택, Enter 열기, Esc/오른쪽 클릭 돌아가기.",
  profile_center_launcher_status_idle: "시작할 프로필 대상을 선택하세요.",
  profile_center_workspace_header: "{value} 프로필 작업 공간",
  profile_center_workspace_hint:
    "키: 좌/우 동작, 상/하 노드, Enter 확인/실행, Esc/오른쪽 클릭 돌아가기.",
  profile_center_filter_placeholder: "내용, 출처, ID, 날짜로 프로필 노드를 필터...",
  profile_center_details_title: "프로필 노드 상세",
  profile_center_details_hint:
    "위에서 노드를 선택하면 아래에 전체 상세 표가 표시됩니다.",
  profile_center_details_meta_title: "구조화 필드",
  profile_target_user_launcher: "사용자 프로필",
  profile_target_project_launcher: "프로젝트 프로필",
  profile_target_space_launcher: "공간 프로필",
  profile_target_team_launcher: "팀 프로필",
  profile_detail_field_node_id: "노드 ID",
  profile_detail_field_target: "대상",
  profile_detail_field_bind_id: "바인드 ID",
  profile_detail_field_priority: "우선순위",
  profile_detail_field_level: "레벨",
  profile_detail_field_refresh_weight: "새로고침 가중치",
  profile_detail_field_profile_date: "프로필 날짜",
  profile_detail_field_expires: "만료일",
  profile_detail_field_source: "출처",
  profile_detail_field_source_id: "출처 ID",
  profile_detail_field_content: "프로필 상세",
  profile_detail_field_reason: "레벨 이유",
  profile_target_user: "사용자",
  profile_target_project: "프로젝트",
  profile_target_team: "팀",
  profile_target_space: "공간",
  profile_table_scope: "대상",
  profile_table_expires: "만료일",
  profile_table_source: "출처",
  profile_table_content: "상세",
  scope_local_title: "쓰기 범위: 워크스페이스",
  scope_global_title: "쓰기 범위: 전역",
  scope_selected_subtitle: "{scope} 이 현재 쓰기 범위입니다.",
  scope_switch_subtitle: "현재 쓰기 범위를 {scope} 으로 전환합니다.",
  scope_detail_selected: "{scope} 이 이미 현재 쓰기 범위입니다.",
  scope_detail_switch: "다음 변경은 {scope} 에 기록됩니다.",
  back_setting_title: "제어 패널로 돌아가기",
  back_setting_subtitle: "기능 목록으로 돌아갑니다.",
  back_setting_detail_1: "최상위 설정 센터로 돌아갑니다.",
  back_setting_detail_2: "이렇게 하면 목록 중심, 창 중심 흐름을 유지할 수 있습니다.",
})

/**
 * Final lookup table for all supported TUI languages.
 * 所有受支持 TUI 语言使用的最终查找表。
 */
Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.es, {
  setting_menu_tools_debug_subtitle:
    "Probar las interfaces gRPC de VMM relacionadas con tools usando los enlaces actuales del workspace.",
  setting_menu_tools_debug_detail_1:
    "Abrir una página aislada para las RPC de memoria duradera expuestas a tools.",
  setting_menu_tools_debug_detail_2:
    "La página reutiliza el vulcan_host_target actual y, cuando hace falta, también las vinculaciones actuales de user/project y el contexto de la sesión activa.",
  setting_menu_tools_debug_detail_3:
    "Permite inspeccionar las cargas crudas de request y response sin salir de /vulcan-setting.",
  setting_menu_tools_debug_title: "Depurar Tools",
  tools_debug_title: "Depuración Tools VMM",
  tools_debug_section_actions: "Acciones",
  tools_debug_section_request: "Última petición",
  tools_debug_section_response: "Última respuesta",
  tools_debug_status_idle: "Selecciona una acción para empezar a probar la interfaz gRPC actual.",
  tools_debug_loading: "Ejecutando {label}...",
  tools_debug_missing_grpc: "vulcan_host_target aún no está configurado.",
  tools_debug_missing_scope: "Esta acción requiere user_id y project_id actuales.",
  tools_debug_request_empty: "Aún no se ha ejecutado ninguna petición.",
  tools_debug_response_empty: "Todavía no hay respuesta disponible.",
  tools_debug_keys_hint: "Teclas: Arriba/Abajo seleccionar | Enter ejecutar | Esc/clic derecho volver",
  tools_debug_action_healthz_subtitle: "Comprobar alcance de transporte sin ámbito de negocio.",
  tools_debug_action_search_memory_subtitle:
    "Ejecutar una búsqueda activa de memoria con consultas simples y las vinculaciones actuales.",
  tools_debug_action_turn_details_subtitle:
    "Leer detalles estructurados del turn origen mediante ids exactos.",
  tools_debug_action_write_memories_subtitle:
    "Rellenar los campos reales orientados a IA y escribir un item de memoria directo en las vinculaciones actuales.",
  tools_debug_search_prompt_title: "Líneas de búsqueda",
  tools_debug_search_prompt_description:
    "Introduce una consulta completa por línea. Mantén cada consulta en su propia línea porque las comas pueden formar parte del contenido. La API simplificada ya no usa `background => query`.",
  tools_debug_search_prompt_empty: "La lista de consultas no puede estar vacía.",
  tools_debug_search_prompt_invalid:
    "Introduce al menos una línea de consulta no vacía y mantén cada consulta en su propia línea.",
  tools_debug_search_topk_prompt_title: "TopK de búsqueda",
  tools_debug_search_topk_prompt_placeholder: "Entero positivo",
  tools_debug_search_topk_prompt_description:
    "Introduce un entero positivo para top_k y pulsa Enter.",
  tools_debug_search_topk_prompt_empty: "top_k no puede estar vacío.",
  tools_debug_search_topk_prompt_invalid: "top_k debe ser un entero positivo.",
  tools_debug_turn_prompt_title: "IDs de turn",
  tools_debug_turn_prompt_description:
    "Introduce un source_turn_id por línea o sepáralos con comas. Usa los ids devueltos por SearchMemoryEvents cuando source_turn_id no sea 0.",
  tools_debug_turn_prompt_empty: "La lista de turn ids no puede estar vacía.",
  tools_debug_turn_prompt_invalid:
    "Usa un entero positivo por línea o una lista separada por comas como 1,2.",
  tools_debug_write_prompt_title: "Resumen de memoria",
  tools_debug_write_prompt_description:
    "Rellena los campos paso a paso. En la API simplificada abstract, details y category son obligatorios.",
  tools_debug_write_prompt_empty: "El resumen de memoria no puede estar vacío.",
  tools_debug_write_prompt_invalid:
    "Introduce un resumen de memoria no vacío.",
})

Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.fr, {
  setting_menu_tools_debug_subtitle:
    "Tester les interfaces gRPC VMM liées aux tools avec les liaisons actuelles du workspace.",
  setting_menu_tools_debug_detail_1:
    "Ouvrir une page isolée pour les RPC de mémoire durable exposées aux tools.",
  setting_menu_tools_debug_detail_2:
    "La page réutilise le vulcan_host_target actuel et, si nécessaire, les liaisons user/project courantes ainsi que le contexte de session active.",
  setting_menu_tools_debug_detail_3:
    "Permet d'inspecter les payloads bruts de requête et de réponse sans quitter /vulcan-setting.",
  setting_menu_tools_debug_title: "Debug Tools",
  tools_debug_title: "Debug Tools VMM",
  tools_debug_section_actions: "Actions",
  tools_debug_section_request: "Dernière requête",
  tools_debug_section_response: "Dernière réponse",
  tools_debug_status_idle: "Sélectionnez une action pour commencer à tester l'interface gRPC actuelle.",
  tools_debug_loading: "Exécution de {label}...",
  tools_debug_missing_grpc: "vulcan_host_target n'est pas encore configuré.",
  tools_debug_missing_scope: "Cette action nécessite user_id et project_id courants.",
  tools_debug_request_empty: "Aucune requête n'a encore été exécutée.",
  tools_debug_response_empty: "Aucune réponse n'est encore disponible.",
  tools_debug_keys_hint: "Touches : Haut/Bas sélectionner | Entrée exécuter | Esc/clic droit retour",
  tools_debug_action_healthz_subtitle:
    "Vérifier la connectivité transport sans portée métier.",
  tools_debug_action_search_memory_subtitle:
    "Exécuter une recherche active de mémoire avec des requêtes simples et les liaisons courantes.",
  tools_debug_action_turn_details_subtitle:
    "Lire des détails structurés du turn source via des ids exacts.",
  tools_debug_action_write_memories_subtitle:
    "Renseigner les vrais champs orientés IA puis écrire un item mémoire direct dans les liaisons courantes.",
  tools_debug_search_prompt_title: "Lignes de recherche",
  tools_debug_search_prompt_description:
    "Saisissez une requête complète par ligne. Gardez chaque requête sur sa propre ligne, car les virgules peuvent faire partie du contenu. L'API simplifiée n'utilise plus `background => query`.",
  tools_debug_search_prompt_empty: "La liste des requêtes ne peut pas être vide.",
  tools_debug_search_prompt_invalid:
    "Fournissez au moins une ligne de requête non vide et gardez chaque requête sur sa propre ligne.",
  tools_debug_search_topk_prompt_title: "TopK de recherche",
  tools_debug_search_topk_prompt_placeholder: "Entier positif",
  tools_debug_search_topk_prompt_description:
    "Saisissez un entier positif pour top_k puis validez.",
  tools_debug_search_topk_prompt_empty: "top_k ne peut pas être vide.",
  tools_debug_search_topk_prompt_invalid: "top_k doit être un entier positif.",
  tools_debug_turn_prompt_title: "IDs de turn",
  tools_debug_turn_prompt_description:
    "Saisissez un source_turn_id par ligne ou séparé par des virgules. Utilisez les ids renvoyés par SearchMemoryEvents lorsque source_turn_id n'est pas 0.",
  tools_debug_turn_prompt_empty: "La liste des turn ids ne peut pas être vide.",
  tools_debug_turn_prompt_invalid:
    "Utilisez un entier positif par ligne ou une liste séparée par des virgules comme 1,2.",
  tools_debug_write_prompt_title: "Résumé mémoire",
  tools_debug_write_prompt_description:
    "Renseignez les champs étape par étape. Dans l'API simplifiée, abstract, details et category sont obligatoires.",
  tools_debug_write_prompt_empty: "Le résumé mémoire ne peut pas être vide.",
  tools_debug_write_prompt_invalid:
    "Saisissez un résumé mémoire non vide.",
})

Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.de, {
  setting_menu_tools_debug_subtitle:
    "Die tool-bezogenen VMM-gRPC-Schnittstellen mit den aktuellen Workspace-Bindungen testen.",
  setting_menu_tools_debug_detail_1:
    "Eine isolierte Seite für die tool-seitigen Durable-Memory-RPCs öffnen.",
  setting_menu_tools_debug_detail_2:
    "Die Seite verwendet das aktuelle vulcan_host_target und bei Bedarf auch die aktuellen user/project-Bindungen sowie den Kontext der aktiven Session.",
  setting_menu_tools_debug_detail_3:
    "Damit lassen sich rohe Request- und Response-Payloads prüfen, ohne /vulcan-setting zu verlassen.",
  setting_menu_tools_debug_title: "Tools Debug",
  tools_debug_title: "VMM Tools Debug",
  tools_debug_section_actions: "Aktionen",
  tools_debug_section_request: "Letzte Anfrage",
  tools_debug_section_response: "Letzte Antwort",
  tools_debug_status_idle:
    "Wähle eine Aktion, um die aktuelle gRPC-Schnittstelle zu testen.",
  tools_debug_loading: "{label} wird ausgeführt...",
  tools_debug_missing_grpc: "vulcan_host_target ist noch nicht konfiguriert.",
  tools_debug_missing_scope: "Diese Aktion benötigt aktuelle user_id- und project_id-Bindungen.",
  tools_debug_request_empty: "Es wurde noch keine Anfrage ausgeführt.",
  tools_debug_response_empty: "Es ist noch keine Antwort verfügbar.",
  tools_debug_keys_hint: "Tasten: Hoch/Runter wählen | Enter ausführen | Esc/Rechtsklick zurück",
  tools_debug_action_healthz_subtitle:
    "Transport-Erreichbarkeit ohne fachlichen Scope prüfen.",
  tools_debug_action_search_memory_subtitle:
    "Eine aktive Memory-Suche mit einfachen Queries und den aktuellen Bindungen ausführen.",
  tools_debug_action_turn_details_subtitle:
    "Strukturierte Quell-Turn-Details per exakter Turn-ID lesen.",
  tools_debug_action_write_memories_subtitle:
    "Die KI-relevanten Felder ausfüllen und ein direktes Memory-Item in die aktuellen Bindungen schreiben.",
  tools_debug_search_prompt_title: "Suchzeilen",
  tools_debug_search_prompt_description:
    "Eine vollständige Anfrage pro Zeile eingeben. Jede Anfrage sollte in einer eigenen Zeile stehen, weil Kommata Teil des Inhalts sein können. Die vereinfachte API nutzt kein `background => query` mehr.",
  tools_debug_search_prompt_empty: "Die Suchliste darf nicht leer sein.",
  tools_debug_search_prompt_invalid:
    "Mindestens eine nicht leere Anfragezeile angeben und jede Anfrage in einer eigenen Zeile lassen.",
  tools_debug_search_topk_prompt_title: "Search TopK",
  tools_debug_search_topk_prompt_placeholder: "Positive Ganzzahl",
  tools_debug_search_topk_prompt_description:
    "Eine positive Ganzzahl für top_k eingeben und Enter drücken.",
  tools_debug_search_topk_prompt_empty: "top_k darf nicht leer sein.",
  tools_debug_search_topk_prompt_invalid: "top_k muss eine positive Ganzzahl sein.",
  tools_debug_turn_prompt_title: "Turn-IDs",
  tools_debug_turn_prompt_description:
    "Eine source_turn_id pro Zeile eingeben oder per Komma trennen. Verwende die von SearchMemoryEvents zurückgegebenen IDs, wenn source_turn_id nicht 0 ist.",
  tools_debug_turn_prompt_empty: "Die Turn-ID-Liste darf nicht leer sein.",
  tools_debug_turn_prompt_invalid:
    "Eine positive Ganzzahl pro Zeile oder eine komma-getrennte Liste wie 1,2 verwenden.",
  tools_debug_write_prompt_title: "Memory-Zusammenfassung",
  tools_debug_write_prompt_description:
    "Die Felder Schritt für Schritt ausfüllen. In der vereinfachten API sind abstract, details und category Pflichtfelder.",
  tools_debug_write_prompt_empty: "Die Memory-Zusammenfassung darf nicht leer sein.",
  tools_debug_write_prompt_invalid:
    "Eine nicht leere Memory-Zusammenfassung eingeben.",
})

Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.ja, {
  setting_menu_tools_debug_subtitle:
    "現在のワークスペース束縛で tools 関連の VMM gRPC インターフェースを検証します。",
  setting_menu_tools_debug_detail_1:
    "tools 向けに公開される長期 memory RPC を試す独立ページを開きます。",
  setting_menu_tools_debug_detail_2:
    "このページは現在の vulcan_host_target に加え、必要に応じて現在の user/project 束縛とアクティブ session 文脈も再利用します。",
  setting_menu_tools_debug_detail_3:
    "/vulcan-setting を離れずに raw の request/response payload を確認できます。",
  setting_menu_tools_debug_title: "TOOLS デバッグ",
  tools_debug_title: "VMM Tools デバッグ",
  tools_debug_section_actions: "アクション",
  tools_debug_section_request: "直近のリクエスト",
  tools_debug_section_response: "直近のレスポンス",
  tools_debug_status_idle:
    "アクションを 1 つ選んで現在の gRPC インターフェースをテストします。",
  tools_debug_loading: "{label} を実行中...",
  tools_debug_missing_grpc: "vulcan_host_target がまだ設定されていません。",
  tools_debug_missing_scope:
    "このアクションには現在の user_id と project_id の束縛が必要です。",
  tools_debug_request_empty: "まだリクエストは実行されていません。",
  tools_debug_response_empty: "まだ表示できるレスポンスはありません。",
  tools_debug_keys_hint: "キー: 上下で選択 | Enter で実行 | Esc/右クリックで戻る",
  tools_debug_action_healthz_subtitle:
    "業務スコープなしで transport 到達性を確認します。",
  tools_debug_action_search_memory_subtitle:
    "現在の束縛で simple query 版の active memory search を実行します。",
  tools_debug_action_turn_details_subtitle:
    "正確な turn id で source turn の構造化詳細を読み取ります。",
  tools_debug_action_write_memories_subtitle:
    "AI 向けの実フィールドを順に入力して、現在の束縛へ direct memory item を書き込みます。",
  tools_debug_search_prompt_title: "検索クエリ行",
  tools_debug_search_prompt_description:
    "1 行に 1 件の完全なクエリを入力します。カンマはクエリ本文に含まれうるため、各クエリは必ず別行にしてください。簡略化後の API では `background => query` は使いません。",
  tools_debug_search_prompt_empty: "検索クエリ一覧は空にできません。",
  tools_debug_search_prompt_invalid:
    "少なくとも 1 件の空でないクエリを入力し、各クエリを別の行にしてください。",
  tools_debug_search_topk_prompt_title: "検索 TopK",
  tools_debug_search_topk_prompt_placeholder: "正の整数",
  tools_debug_search_topk_prompt_description:
    "top_k の正の整数を入力して Enter を押してください。",
  tools_debug_search_topk_prompt_empty: "top_k は空にできません。",
  tools_debug_search_topk_prompt_invalid: "top_k は正の整数である必要があります。",
  tools_debug_turn_prompt_title: "Turn IDs",
  tools_debug_turn_prompt_description:
    "source_turn_id を 1 行ずつ、またはカンマ区切りで入力してください。SearchMemoryEvents が返した 0 以外の source_turn_id を使ってください。",
  tools_debug_turn_prompt_empty: "turn id 一覧は空にできません。",
  tools_debug_turn_prompt_invalid:
    "1 行に 1 件の正整数、または 1,2 のようなカンマ区切り一覧を使ってください。",
  tools_debug_write_prompt_title: "メモリ要約",
  tools_debug_write_prompt_description:
    "各フィールドを順に入力します。簡略化後の API では abstract、details、category が必須です。",
  tools_debug_write_prompt_empty: "メモリ要約は空にできません。",
  tools_debug_write_prompt_invalid:
    "空でないメモリ要約を入力してください。",
})

Object.assign(VMM_TUI_CATALOGS_SUPPLEMENTAL.ko, {
  setting_menu_tools_debug_subtitle:
    "현재 워크스페이스 바인딩으로 tools 관련 VMM gRPC 인터페이스를 점검합니다.",
  setting_menu_tools_debug_detail_1:
    "tools 에 공개되는 장기 memory RPC 를 시험하는 독립 페이지를 엽니다.",
  setting_menu_tools_debug_detail_2:
    "이 페이지는 현재 vulcan_host_target 과 필요 시 현재 user/project 바인딩, 그리고 활성 session 문맥도 재사용합니다.",
  setting_menu_tools_debug_detail_3:
    "/vulcan-setting 을 벗어나지 않고 raw request/response payload 를 확인할 수 있습니다.",
  setting_menu_tools_debug_title: "TOOLS 디버그",
  tools_debug_title: "VMM Tools 디버그",
  tools_debug_section_actions: "동작",
  tools_debug_section_request: "최근 요청",
  tools_debug_section_response: "최근 응답",
  tools_debug_status_idle: "하나의 동작을 선택해 현재 gRPC 인터페이스를 점검하세요.",
  tools_debug_loading: "{label} 실행 중...",
  tools_debug_missing_grpc: "vulcan_host_target 이 아직 설정되지 않았습니다.",
  tools_debug_missing_scope: "이 동작에는 현재 user_id 와 project_id 바인딩이 모두 필요합니다.",
  tools_debug_request_empty: "아직 실행된 요청이 없습니다.",
  tools_debug_response_empty: "아직 표시할 응답이 없습니다.",
  tools_debug_keys_hint: "키: 위/아래 선택 | Enter 실행 | Esc/오른쪽 클릭 돌아가기",
  tools_debug_action_healthz_subtitle: "비즈니스 범위 없이 transport 도달성을 확인합니다.",
  tools_debug_action_search_memory_subtitle:
    "현재 바인딩으로 simple query 기반 active memory search 를 실행합니다.",
  tools_debug_action_turn_details_subtitle:
    "정확한 turn id 로 source turn 의 구조화 상세를 읽습니다.",
  tools_debug_action_write_memories_subtitle:
    "AI 지향 실제 입력 필드를 따라 한 건의 direct memory item 을 현재 바인딩에 기록합니다.",
  tools_debug_search_prompt_title: "검색 쿼리 줄",
  tools_debug_search_prompt_description:
    "한 줄에 하나의 완전한 쿼리를 입력하세요. 쉼표는 쿼리 내용의 일부일 수 있으므로 각 쿼리는 반드시 별도 줄에 두세요. 단순화된 API 는 더 이상 `background => query` 를 사용하지 않습니다.",
  tools_debug_search_prompt_empty: "검색 쿼리 목록은 비워둘 수 없습니다.",
  tools_debug_search_prompt_invalid:
    "비어 있지 않은 쿼리를 한 개 이상 입력하고 각 쿼리를 별도 줄에 유지하세요.",
  tools_debug_search_topk_prompt_title: "검색 TopK",
  tools_debug_search_topk_prompt_placeholder: "양의 정수",
  tools_debug_search_topk_prompt_description:
    "top_k 용 양의 정수를 입력하고 Enter 를 누르세요.",
  tools_debug_search_topk_prompt_empty: "top_k 는 비워둘 수 없습니다.",
  tools_debug_search_topk_prompt_invalid: "top_k 는 양의 정수여야 합니다.",
  tools_debug_turn_prompt_title: "Turn IDs",
  tools_debug_turn_prompt_description:
    "source_turn_id 를 한 줄씩 입력하거나 쉼표로 구분하세요. SearchMemoryEvents 가 반환한 0이 아닌 source_turn_id 를 사용하세요.",
  tools_debug_turn_prompt_empty: "turn id 목록은 비워둘 수 없습니다.",
  tools_debug_turn_prompt_invalid:
    "한 줄당 하나의 양의 정수 또는 1,2 같은 쉼표 구분 목록을 사용하세요.",
  tools_debug_write_prompt_title: "메모리 요약",
  tools_debug_write_prompt_description:
    "필드를 단계별로 입력하세요. 단순화된 API 에서는 abstract, details, category 가 필수입니다.",
  tools_debug_write_prompt_empty: "메모리 요약은 비워둘 수 없습니다.",
  tools_debug_write_prompt_invalid:
    "비어 있지 않은 메모리 요약을 입력하세요.",
})

const VMM_TUI_CATALOGS: Record<VmmLanguage, VmmTuiCatalog> = {
  en: VMM_TUI_CATALOG_EN,
  "zh-CN": VMM_TUI_CATALOG_ZH_CN,
  es: { ...VMM_TUI_CATALOGS_COMPACT.es, ...VMM_TUI_CATALOGS_SUPPLEMENTAL.es },
  fr: { ...VMM_TUI_CATALOGS_COMPACT.fr, ...VMM_TUI_CATALOGS_SUPPLEMENTAL.fr },
  de: { ...VMM_TUI_CATALOGS_COMPACT.de, ...VMM_TUI_CATALOGS_SUPPLEMENTAL.de },
  ja: { ...VMM_TUI_CATALOGS_COMPACT.ja, ...VMM_TUI_CATALOGS_SUPPLEMENTAL.ja },
  ko: { ...VMM_TUI_CATALOGS_COMPACT.ko, ...VMM_TUI_CATALOGS_SUPPLEMENTAL.ko },
}

/**
 * Read one localized TUI text and fill runtime placeholders when needed.
 * 读取一条本地化 TUI 文案，并在需要时填充运行时占位变量。
 */
export function tVmmTui(
  language: VmmLanguage | undefined,
  key: VmmTuiTextKey,
  vars: Record<string, string | number> = {},
) {
  const catalog = VMM_TUI_CATALOGS[language ?? "en"] ?? VMM_TUI_CATALOGS.en
  return formatTemplate(catalog[key] ?? VMM_TUI_CATALOGS.en[key], vars)
}

/**
 * Read the localized command metadata shown by the TUI command palette.
 * 读取 TUI 命令面板里展示的本地化命令元数据。
 */
export function getVmmTuiCommandMetadata(language: VmmLanguage | undefined) {
  return {
    title: tVmmTui(language, "command_title"),
    description: tVmmTui(language, "command_description"),
    mountedEntryLabel: tVmmTui(language, "mounted_entry_label"),
  }
}


