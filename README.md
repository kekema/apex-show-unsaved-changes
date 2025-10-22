# apex-show-unsaved-changes
Dynamic action plugin to show a message notification listing unsaved changes on the page.

<p>
<img src="./show-unsaved-changes.jpg" height="25%" width="25%">
</p>

See also this [blog post](https://karelekema.hashnode.dev/oracle-apex-show-unsaved-changes-plugin).

The DA is not having any configuration.

In case you want to show the message notification upon the user canceling a Warning on unsaved changes, you can use next code:

Page - Function and Global Variable Declaration:
```
(function(){
    let unloadTriggered = false;

    // beforeunload handler
    window.addEventListener('beforeunload', function (e) {
        if (apex.page.isChanged()) {
            unloadTriggered = true;
        }
    });

    // detect cancel (user stayed on the page)
    window.addEventListener('focus', function () {
        if (unloadTriggered) {
            unloadTriggered = false;
            // use a timeout, so in case unloading is proceeding, it will not reach the trigger
            setTimeout(()=>{
                // it will reach here when user cancels reload/leave site and returns to the page
                apex.event.trigger(apex.gPageContext$, 'unloadcancelled');
            }, 1000);
        }
    });
})();
```
Then in the page designer, you can create the DA upon custom 'unloadcancelled' event.
<h5>API</h5>

lib4x.message.unsavedChanges.addVisibilityCheck(pFunction) : same purpose as [apex.message.addVisibilityCheck()](https://docs.oracle.com/en/database/oracle/apex/24.2/aexjs/apex.message.html#.addVisibilityCheck)

lib4x.message.unsavedChanges.addExtraChangedItemsCheck(pFunction) : give a function which returns any additional changes which are not tracked by APEX. The return is a string array. The items will be added to the list without hyperlink. Also see [apex.page.warnOnUnsavedChanges()](https://docs.oracle.com/en/database/oracle/apex/24.2/aexjs/apex.page.html#.warnOnUnsavedChanges), in particular the 'pExtraIsChanged' flag.

window.lib4x.message.unsavedChanges.show()

window.lib4x.message.unsavedChanges.hide()

<h5>Translation</h5>

Next are the messages available for translation:

LIB4X.UC.NO_CHANGES_MSG : 'There are no unsaved changes.'<br>
LIB4X.UC.CHANGES_MSG' : 'Unsaved change(s):'<br>
LIB4X.UC.MSG_HEADING' : 'Unsaved Changes Message'

<h4>Plugin Versions</h4>
Version 1.0.0 - build under APEX 24.2
