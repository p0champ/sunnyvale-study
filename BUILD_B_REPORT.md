# Build B — task modes and passthrough look

Built in a separate checkout from the active preview. Six modes (Thesis, Script, Ideas, Reading, Exam, Film study) save and restore poses independently. Mode-specific menus are short; common controls remain in WORLD with a MODE picker. Existing Classic/Bubble look is preserved; new users default to Bubble. Thesis panels use the shared dark-glass palette and mode accent. A faint edge tint, manual brightness adjustment, evening warmth and soft contact shadows support passthrough. Desk/wall snapping requires explicit user calibration; no automatic room scan is claimed. Reading log, poems and daily streaks persist locally.

PC checks: exact pose restoration, reload, six menu sizes and existing look switch pass. Full suite and independent review follow before activation. Screenshots: build-b-thesis-front/side and mode-picker. No main publication, no live bridge change, no Quest checks.

Use list_modes, switch_mode({mode}), set_room_brightness({value}), calibrate_surface({name,position,normal}), snap_to_surface({id,surface}), record_reading and open_reading_shelf through use_study_tool. Quest must check wrist menu reachability, comfort, room brightness and actual calibration.
