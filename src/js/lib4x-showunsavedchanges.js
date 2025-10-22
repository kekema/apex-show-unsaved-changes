window.lib4x = window.lib4x || {};
window.lib4x.axt = window.lib4x.axt || {};

/*
 * LIB4X Show Unsaved Changes
 * Dynamic Action plugin to show a message notification, listing any unsaved changes on the page. 
 * These can be changes from Page Items, Interactive Grids and extra changes. The logic to detect the changes
 * is the same as the check behind the 'unsaved changes check' upon page unload. As a consequence, 
 * page items where 'Warn on Unsaved Changes' is configured as 'Ignore' are ignored here as well.
 * So when the user is encountering the warning on unsaved changes, this plugin functionality 
 * enables the user to check the concrete changes.
 * A listed change acts as a link, enabling the user to focus the related Page Item or Interactive Grid 
 * row. When the Page Item is not visible as because of a collapsed region or non-active tab, the region
 * or tab will be made visible/active. When there are multiple changes in an Interactive Grid, it will
 * focus the row with the first applied change.
 * Extra functions can be registered for addVisibilityCheck and addExtraChangedItemsCheck.
 * It's up to the app developer to decide where to make the 'Show Unsaved Changes' available. One
 * option is to add a 'Changes' button to the Banner (before navigation bar).
 * There are no configuration options to the plugin.
 * Code fragments from behind the native APEX 'Show Errors' message feature and behind the 'page is changed'
 * check were taken as a base for the below source code.
 */
lib4x.axt.showUnsavedChanges = (function($) {
    const SEL_IGNORE_CHANGE = '.js-ignoreChange';
    const C_VISIBLE = 'u-visible';
    const C_HIDDEN = 'u-hidden';
    const TABS_SHOW_ALL = '#SHOW_ALL';
    const C_NOTIFICATION_ID = 't_UnsavedChanges_Notification';

    let gThemeHooks = {
        closeNotificationSelector: 'button.t-Button--closeAlert',
        pageInfoContainerSelector: '#' + C_NOTIFICATION_ID
    };

    //==main module
    let mainModule = (function() {
        let checkVisibilityFunctions = [];
        let addExtraChangedItemsCheckFunction = null;

        function addVisibilityCheck(pFunction) {
            checkVisibilityFunctions.push(pFunction);
        };         

        function addExtraChangedItemsCheck(pFunction) {
            addExtraChangedItemsCheckFunction = pFunction;
        };    

        function hideUnsavedChanges() {
            $('#LIB4X_UNSAVED_CHANGES_MESSAGE').removeClass(C_VISIBLE).addClass(C_HIDDEN);
        }          

        $(function() {
            initMessages();
            // set up a mutation observer on APEX messages being shown
            // as to hide an open Unsaved Changes message 
            const targetErrorMessage = document.querySelector('#APEX_ERROR_MESSAGE');
            const targetSuccessMessage = document.querySelector('#APEX_SUCCESS_MESSAGE');
            const observer = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    let isVisible = mutation.target.offsetParent !== null; 
                    if (isVisible) {
                        hideUnsavedChanges();
                    }
                }
            });
            observer.observe(targetErrorMessage, {attributes: true, attributeFilter: ['style', 'class']});
            observer.observe(targetSuccessMessage, {attributes: true, attributeFilter: ['style', 'class']});

            // adding same visibility checks as APEX is doing for ShowErrors
            addVisibilityCheck(function(id) {
                $('#' + id).parents('.a-Collapsible').collapsible('expand');
            });            
            addVisibilityCheck(function(id) {
                let el$ = $('#' + id);
                el$.parents('.a-Splitter').each(function() {
                    if (!el$.is(':visible')) {
                        $(this).splitter('option', 'collapsed', false);
                    }
                });  
            });
            addVisibilityCheck(function activateTab(id) {
                let tab, activeTab;
                let el$ = $('#' + id);

                if ($.apex.aTabs) {
                    tab = $.apex.aTabs.findClosestTab(el$);
                    if (tab) {
                        activeTab = tab.tabSet$.aTabs('getActive');
                        if ((activeTab !== tab && activeTab.href !== TABS_SHOW_ALL) || !el$.is(':visible')) {
                            tab.makeActive();
                        }
                        activateTab(tab.el$[0].id); // check for nested tab sets
                    }
                }           
            });

            // create placeholder for unsaved changes message, as a copy of the apex error message placeholder
            let message$ = $('#APEX_ERROR_MESSAGE').clone();
            message$.attr('id', 'LIB4X_UNSAVED_CHANGES_MESSAGE');
            $('#APEX_ERROR_MESSAGE').after(message$); 
            message$.removeAttr('data-template-id');    // not needed, we have our own template inline
            message$.removeClass('apex-page-error').addClass('lib4x-page-changes')

            // set up on click event handler for close button
            $('#LIB4X_UNSAVED_CHANGES_MESSAGE').on('click', gThemeHooks.closeNotificationSelector, function (pEvent) {
                hideUnsavedChanges();
                pEvent.preventDefault();
            });   

            // set up click event handler for message item links
            $('#LIB4X_UNSAVED_CHANGES_MESSAGE').on('click', 'a.a-Notification-link', function(pEvent) {
                let link$ = $(this);
                let itemContext = {};   // message item context
                // populate itemContext object
                // keep list of attributes in sync with code that adds them
                ['data-region', 'data-model', 'data-instance', 'data-for'].forEach(function(attr) {
                    let prop = attr.slice(5);   // region, model, instance, etc
                    let value = link$.attr(attr);
                    if (value !== undefined) {
                        itemContext[prop] = value;
                    }
                });
                goToItem(itemContext);
                pEvent.preventDefault();
            });              

            function goToItem(itemContext) {
                let itemId = itemContext.for;

                function makeVisible(id) {
                    for (let i = 0; i < checkVisibilityFunctions.length; i++) {
                        checkVisibilityFunctions[ i ](id);
                    }            
                }

                if (itemContext.for) {
                    let apexItem = apex.item(itemId);
                    // make sure item can be seen if it is collapsed or on a non-active tab
                    makeVisible(itemId);
                    if ($('#' + itemId + '_CONTAINER,#' + itemId + '_DISPLAY,#' + itemId, apex.gPageContext$).filter(':visible').length === 0) {
                        apexItem.show();
                    }
                    apexItem.setFocus();
                } else if (itemContext.region) {
                    let regionId = itemContext.region;
                    let region = null;
                    // make sure region can be seen if it is collapsed or on a non-active tab
                    makeVisible(regionId);
                    region = apex.region(regionId);
                    if (region) {
                        let skipGoto = false;
                        if (region.type == 'InteractiveGrid') {
                            skipGoto = true;
                            itemContext.record = null;
                            let modelId = itemContext.instance ? [itemContext.model, itemContext.instance] : itemContext.model;
                            let model = apex.model.get(modelId);
                            if (model && model.isChanged()) {
                                let modelChanges = model.getChanges();   
                                if (modelChanges.length) {             
                                    // take the first change        
                                    let record = modelChanges[0].record;
                                    if (record) {
                                        itemContext.record = model.getRecordId(record);
                                        skipGoto = false;
                                    }
                                }
                            }
                            apex.model.release(modelId);
                        }
                        if (!skipGoto) {
                            if (itemContext.instance) {
                                let parentRegion = apex.region(region.parentRegionId);
                                parentRegion.call('instance').gotoCell(null, itemContext.instance, null);
                                // give some time for the detail IG to sync with the master
                                setTimeout(()=>{
                                    // gotoError wil just work fine here to jump to the change
                                    region.gotoError(itemContext);
                                }, 1000);           
                            }
                            else {
                                region.gotoError(itemContext);
                            }
                        }
                    }
                }
            }        
        });    
        
        let getMessageItems = function() {
            let messageItems = [];
            // compose message items from any page item changes
            apex.page.forEachPageItem($('#wwvFlowForm'), function(el, name) {
                if (!el.disabled) {
                    // skip when 'Warn on Unsaved Changes' is configured as 'Ignore'
                    if ($(el).closest(SEL_IGNORE_CHANGE).length === 0) {
                        if (apex.item(name).isChanged()) {
                            let messageItem = {
                                pageItem: name,
                                content: itemUtil.getLabelFor(name),
                                unsafe: false
                            }
                            messageItems.push(messageItem);
                        }
                    }
                }
            });
            // compose message items from any grid model (instance) changes
            let apexModel = apex.model;
            if (apexModel && apexModel.anyChanges()) {
                apexModel.list().forEach(modelId => {
                    const model = apexModel.get(modelId);
                    if (model && model.isChanged()) {
                        let regionStaticId = model.getOption('regionStaticId');
                        let messageItemContent = apex.region(regionStaticId).call('option', 'config').regionAccTitle;
                        let messageItem = {
                            regionStaticId: regionStaticId,
                            model: model.name,
                            instance: model.instance,
                            content: messageItemContent,
                            unsafe: false
                        }
                        messageItems.push(messageItem);
                    }
                    apexModel.release(modelId);
                });
            } 
            // compose message items from any extra changed items addExtraChangedItemsCheck
            if (addExtraChangedItemsCheckFunction) {
                let extraItems = addExtraChangedItemsCheckFunction();
                for (const extraItem of extraItems) {
                    let messageItem = {
                        content: extraItem,
                        unsafe: false
                    };
                    messageItems.push(messageItem);
                }
            }
            return messageItems;           
        };

        // show the message notification
        let showMessage = function(messageItems) {
            let messageSummary = null;
            let out = apex.util.htmlBuilder();
            let lTemplateData = {};
            let lUnsavedChangesMessagePlaceholder$ = $('#LIB4X_UNSAVED_CHANGES_MESSAGE');

            let template = '<div class="t-Body-alert">' + 
                '<div class="t-Alert t-Alert--defaultIcons t-Alert--info t-Alert--horizontal t-Alert--page t-Alert--colorBG" id="' + C_NOTIFICATION_ID + '" role="region" aria-labelledby="page_info_id">' +
                    '<div class="t-Alert-wrap">' +     
                        '<div class="t-Alert-icon"><span class="t-Icon" role="img" aria-label="Information"></span></div>' +     
                        '<div class="t-Alert-content">' +        
                            '<div class="t-Alert-header">' +          
                            '<h2 id="page_info_id" class="u-vh">#INFO_MESSAGE_HEADING#</h2>' +      
                            '</div>' +
                            '<div class="t-Alert-body" role="alert">#MESSAGE#</div>' +   
                        '</div>' +   
                        '<div class="t-Alert-buttons"><button class="t-Button t-Button--noUI t-Button--icon t-Button--closeAlert" type="button" aria-label="#CLOSE_NOTIFICATION#" title="#CLOSE_NOTIFICATION#"><span class="t-Icon icon-close"></span></button></div>' +   
                    '</div>'+
                '</div>' +
            '</div>';

            lUnsavedChangesMessagePlaceholder$.html(template);

            out.markup('<div')
                .attr('class', 'a-Notification a-Notification--info')
                .markup('>');
            out.markup('<div')
                .attr('class', 'a-Notification-title aInfMsgTitle')
                .markup('>');

            if(messageItems.length === 0) {
                messageSummary = getMessage('NO_CHANGES_MSG');
            } else {
                messageSummary = getMessage('CHANGES_MSG');
            }

            out.content(messageSummary)
                .markup('</div>');
            out.markup('<ul')
                .attr('class', 'a-Notification-list htmldbUlInf')
                .markup('>');

            for (let i = 0; i < messageItems.length; i++) {
                let messageItem   = messageItems[i];
                // check if this message supports navigation to a component, currently it supports going to items or regions
                let hasLink = (messageItem.pageItem || messageItem.regionStaticId);

                out.markup('<li')
                    .attr('class', 'a-Notification-item htmldbStdInf')
                    .markup('>');

                if (hasLink) {
                    // keep list of attributes in sync with click handler code that uses them
                    out.markup('<a')
                        .attr('href', '#')
                        .optionalAttr('data-region', messageItem.regionStaticId)
                        .optionalAttr('data-model', messageItem.model)                    
                        .optionalAttr('data-instance', messageItem.instance)
                        .optionalAttr('data-for', messageItem.pageItem)
                        .attr('class', 'a-Notification-link')
                        .markup('>') ;
                }

                // escape if unsafe is true, or not passed
                if (messageItem.unsafe === undefined || messageItem.unsafe) {
                    out.content(messageItem.content);
                } else {
                    out.markup(messageItem.content);
                }
                if (hasLink) {
                    out.markup('</a>');
                }
                out.markup('</li>');
            }

            out.markup('</ul>');
            out.markup('</div>');

            lTemplateData.placeholders = {
                MESSAGE:                out.toString(),
                CLOSE_NOTIFICATION:     apex.lang.getMessage('APEX.CLOSE_NOTIFICATION'),
                INFO_MESSAGE_HEADING:   getMessage('MSG_HEADING'),
                IMAGE_PREFIX:           window.apex_img_dir || ""
            };

            // substitute template strings
            lUnsavedChangesMessagePlaceholder$.html(
                apex.util.applyTemplate(
                    template,
                    lTemplateData
                )
            );

            lUnsavedChangesMessagePlaceholder$.removeClass(C_HIDDEN).addClass(C_VISIBLE);

            // hide any APEX message
            $('#APEX_ERROR_MESSAGE').removeClass(C_VISIBLE).addClass(C_HIDDEN);
            $('#APEX_SUCCESS_MESSAGE').removeClass(C_VISIBLE).addClass(C_HIDDEN);

            if (gThemeHooks.pageInfoContainerSelector) {
                // try to focus the message container
                $(gThemeHooks.pageInfoContainerSelector).attr('tabindex', '-1').trigger('focus');
            }
        };

        let showUnsavedChanges = function() {
            let messageItems = getMessageItems();
            showMessage(messageItems);
        };

        return {
            showUnsavedChanges: showUnsavedChanges,
            addVisibilityCheck: addVisibilityCheck,
            addExtraChangedItemsCheck: addExtraChangedItemsCheck,
            hideUnsavedChanges: hideUnsavedChanges
        };
    })();     

    let itemUtil = {
        // get item label
        getLabelFor: function(id, altElement$) {
            let esc_id = apex.util.escapeCSS(id);
            let label$ = $('label[for="' + esc_id + '"]'); // first try a label pointing to this form element
            if (!label$[0]) {
                label$ = $('label[id="' + esc_id + '_LABEL"]'); // next try id of label
            }
            if (!label$[0]) {
                let el$ = altElement$ || $('#' + esc_id);
                esc_id = apex.util.escapeCSS(el$.attr('aria-labelledby')); // next try aria-labelledby
                if (esc_id) {
                    label$ = $('#' + esc_id);
                } else {
                    // finally see if there is an aria-label
                    return el$.attr('aria-label') || "";
                }
            }
            return label$.clone().children('.u-vh,.u-VisuallyHidden').remove().end().text().trim();  
        }
    };      
    
    function initMessages() {
        // here we can have the labels and messages for which the developer should be 
        // able to configure translations in APEX
        apex.lang.addMessages({   
            'LIB4X.UC.NO_CHANGES_MSG': 'There are no unsaved changes.',
            'LIB4X.UC.CHANGES_MSG': 'Unsaved change(s):',
            'LIB4X.UC.MSG_HEADING': 'Unsaved Changes Message'
        });            
    }

    function getMessage(key) {
        return apex.lang.getMessage('LIB4X.UC.' + key);
    }     
    
    // called by the DA as to execute the action
    let execute = function() {
        // let daThis = this;
        mainModule.showUnsavedChanges();
    }

    window.lib4x.message = window.lib4x.message || {};    
    window.lib4x.message.unsavedChanges = window.lib4x.message.unsavedChanges || {};
    window.lib4x.message.unsavedChanges.addVisibilityCheck = mainModule.addVisibilityCheck;
    window.lib4x.message.unsavedChanges.addExtraChangedItemsCheck = mainModule.addExtraChangedItemsCheck;
    window.lib4x.message.unsavedChanges.show = execute;
    window.lib4x.message.unsavedChanges.hide = mainModule.hideUnsavedChanges;

    return {
        _execute: execute
    }    
})(apex.jQuery);
