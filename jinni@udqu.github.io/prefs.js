const { Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

function init() {}

function buildPrefsWidget() {
    settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.jinni');

    let widget = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_top: 20,
        margin_bottom: 20,
        margin_start: 20,
        margin_end: 20,
        spacing: 10
    });

    let label = new Gtk.Label({
        label: "Task List Window Width (pixels)",
        halign: Gtk.Align.START
    });
    widget.append(label);

    let widthEntry = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: 50,
            upper: 500,
            step_increment: 10
        }),
        value: settings.get_int('tasklist-window-width'),
        numeric: true
    });
    widthEntry.connect('value-changed', (entry) => {
        settings.set_int('tasklist-window-width', entry.value);
    });
    widget.append(widthEntry);

    return widget;
}
