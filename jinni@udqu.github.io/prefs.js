const { Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

function init() {}

function buildPrefsWidget() {
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.jinni');

    // Add option for window size adjustment setting
    let widget = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_top: 20,
        margin_bottom: 20,
        margin_start: 20,
        margin_end: 20,
        spacing: 10
    });

    // Utility function to create a labeled spin button
    function createLabeledSpinButton(labelText, lower, upper, stepIncrement, value, onChange) {
        const hbox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10
        });

        const label = new Gtk.Label({
            label: labelText,
            hexpand: true,
            halign: Gtk.Align.START
        });

        const spinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: lower,
                upper: upper,
                step_increment: stepIncrement
            }),
            value: value,
            numeric: true,
            halign: Gtk.Align.END,
            width_request: 150
        });

        spinButton.connect('value-changed', onChange);

        const expandBox = new Gtk.Box({ hexpand: true });
        hbox.append(label);
        hbox.append(expandBox);
        hbox.append(spinButton);

        widget.append(hbox);
        return { label, spinButton };
    }

    // Utility function to create a labeled switch
    function createLabeledSwitch(labelText, isActive, onChange) {
        const hbox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10
        });

        const label = new Gtk.Label({
            label: labelText,
            hexpand: true,
            halign: Gtk.Align.START
        });

        const switchWidget = new Gtk.Switch({
            active: isActive,
            halign: Gtk.Align.END
        });

        switchWidget.connect('notify::active', onChange);

        const expandBox = new Gtk.Box({ hexpand: true });
        hbox.append(label);
        hbox.append(expandBox);
        hbox.append(switchWidget);

        widget.append(hbox);
        return switchWidget;
    }

    // Task List Window Width Setting
    createLabeledSpinButton(
        "Task List Window Width (pixels)",
        50,
        500,
        10,
        settings.get_int('tasklist-window-width'),
        (entry) => settings.set_int('tasklist-window-width', entry.value)
    );

    // Add some space between the settings
    widget.append(new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, height_request: 5 }));

    // Persist Tasks Setting
    createLabeledSwitch(
        "Persist tasks across sessions",
        settings.get_boolean('persist-tasks'),
        (sw) => settings.set_boolean('persist-tasks', sw.active)
    );

    // Add some space between the settings
    widget.append(new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, height_request: 5 }));

    // Enable/Disable Previews Setting
    const enablePreviewsSwitch = createLabeledSwitch(
        "Enable Task Previews",
        settings.get_boolean('enable-previews'),
        (switchWidget) => {
            settings.set_boolean('enable-previews', switchWidget.active);
            updatePreviewSettingsSensitivity(switchWidget.active);
        }
    );

    // Task Preview Window Width Setting
    const { label: maxPreviewSizeLabel, spinButton: maxPreviewSizeEntry } = createLabeledSpinButton(
        "Task Preview Window Width (pixels)",
        100,
        500,
        50,
        settings.get_int('max-preview-size'),
        (entry) => settings.set_int('max-preview-size', entry.value)
    );

    // Task Preview Hover Time Setting
    const { label: hoverTimeLabel, spinButton: hoverTimeEntry } = createLabeledSpinButton(
        "Task Preview Hover Time (milliseconds)",
        100,
        5000,
        100,
        settings.get_int('hover-time'),
        (entry) => settings.set_int('hover-time', entry.value)
    );

    // Function to update the sensitivity of preview settings
    function updatePreviewSettingsSensitivity(enabled) {
        maxPreviewSizeLabel.set_sensitive(enabled);
        maxPreviewSizeEntry.set_sensitive(enabled);
        hoverTimeLabel.set_sensitive(enabled);
        hoverTimeEntry.set_sensitive(enabled);
    }

    // Initialize the sensitivity based on the current state of enablePreviewsSwitch
    updatePreviewSettingsSensitivity(enablePreviewsSwitch.active);

    return widget;
}