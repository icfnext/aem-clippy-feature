/**
 * Clippy is a floating helper which comments as you edit a page providing "helpful" hints based on what you are doing.
 * This is a joke implementation which in fact provides no helpful functionality but makes semi random comments which
 * are based on the action the user takes and the resource type which the user takes it on.
 *
 */
( function ( $, ns, channel, window ) {

    var eventTypesToActionTypes = {
        "cq-overlay-click": "select-editable",
        "cq-overlay-outside-click": "blur-selection",
        "cq-overlay-slow-dblclick": "slow-double-click",
        "cq-overlay-fast-dblclick": "fast-double-click",
        "cq-persistence-before-create": "create",
        "cq-persistence-before-delete": "delete",
        "cq-persistence-before-update": "update"
    };

    /*
     * Clippy has a number of personalities each of which have different helpful messages or behaviors.  An action
     * may be linked to a response set.  Further an action / resource type combination may be linked to a response set.
     * The more specific is always preferred.  If multiple responses are available in a response set for a particular
     * concrete action, one is selected at random.
     *
     * A response may be one of three types
     *
     * 1) String - this is simply a message presented to the end user
     * 2) Conversation - this is a tree of question and answer objects which give the user some ability to answer
     *                   questions and have those answers result in further responses
     * 3) Function - the function is passed the editable on which an action is taken and is executed
     *
     */

    var Clippy = function() {

        var personality = 0;
        var currentEditable;
        var dom = $('<div class="aem-assistant-clippy"></div>');

        var messageManager = new function (clippy) {

            var self = this;

            var speechBubble = $('<div class="aem-assistant-clippy-speech-bubble"><div class="speech-content"></div><div class="speech-bubble-arrow"></div></div>');
            var currentMessages;
            var currentMessagePointer = 0;

            speechBubble.click(function () {
                self.progressMessage();
            });

            var showMessage = function () {
                speechBubble.find( '.speech-content' ).html(currentMessages.message[currentMessagePointer]);

                if ( currentMessages.options && currentMessages.options.length ) {
                    $options = $( '<div class="options-set"></div>' );

                    currentMessages.options.forEach( function( currentOptionTitle, i ) {
                        $currentOption = $( '<button class="coral-Button">' + currentOptionTitle + '</button>' );
                        $options.append( $currentOption );

                        $currentOption.click( function( e ) {
                            e.preventDefault();
                            e.stopPropagation();
                            if ( currentMessages.chosenCallback ) {
                                currentMessages.chosenCallback( i );
                            }
                        } );
                    } );

                    speechBubble.find( '.speech-content' ).append( $options );
                }
                speechBubble.fadeIn();
                self.reposition();
                clippy.getDOMElement().attr( 'data-talking', true );
                clippy.getDOMElement().attr( 'data-mood', currentMessages.mood || 'none' );
            };

            /**
             *
             * @param messages Single string message, array of messages, or message definition object
             */
            this.startMessage = function (messages) {
                if ( typeof messages === 'object' ) {
                    if (Array.isArray(messages)) {
                        currentMessages = {
                            message: messages
                        };
                    }
                    else {
                        currentMessages = messages;
                    }
                }
                else {
                    currentMessages = { message: [messages] };
                }
                currentMessagePointer = 0;

                showMessage();
            };

            this.progressMessage = function () {
                if (currentMessages.message[currentMessagePointer + 1]) {
                    currentMessagePointer += 1;
                    showMessage();
                }
                else {
                    currentMessagePointer = 0;
                    currentMessages = null;
                    speechBubble.fadeOut();
                    clippy.getDOMElement().attr( 'data-talking', false );
                    clippy.getDOMElement().attr( 'data-mood', 'none' );
                }
            };

            this.abort = function () {
                currentMessagePointer = 0;
                currentMessages = null;
                speechBubble.fadeOut();
                clippy.getDOMElement().attr( 'data-talking', false );
                clippy.getDOMElement().attr( 'data-mood', 'none' );
            };

            this.reposition = function () {
                speechBubble.position({
                    my: "right bottom",
                    at: "right top-25px",
                    of: clippy.getDOMElement()
                });
            };

            this.init = function () {
                $('body').append(speechBubble);
            };

        }(this);

        var dialogManager = new function( clippy ) {

            var currentDialog;

            this.startDialog = function( dialog ) {
                currentDialog = dialog;

                messageManager.startMessage( {
                    message: [ dialog.message ],
                    options: dialog.options.map( function( currentOption ) {
                        return currentOption.title
                    } ),
                    chosenCallback: this.progressDialog.bind( this )
                } );
            };

            this.progressDialog = function( optionChosen ) {

                var reaction = currentDialog.options[ optionChosen].response;

                switch ( reaction.type ) {
                    case 'message':
                        return clippy.say( reaction.message );
                        break;
                    case 'dialog':
                        return clippy.ask( reaction.dialog );
                        break;
                    case 'function':
                        return clippy.do( reaction.function );
                        break;
                }

            };

            this.abort = function() {
                currentDialog = null;
                messageManager.abort();
            };

        }( this );

        /**
         * Reacts to a concrete action based on type and editable.  If an editable is provided Clippy will endeavor
         * to hover over to the Editable.  In the simplest case this function looks up a reaction in the current
         * personality for the action type / editable resource type combination.  If it can not find one it falls back
         * to a reaction for the action type.  If it can not find this either then the method does nothing.
         *
         * @param actionType
         * @param editable
         */
        this.react = function (actionType, editable) {
            var self = this;

            messageManager.abort();

            var currentPersonality = self.getCurrentPersonality();
            var reaction = currentPersonality.reactions[actionType] ?
                ( currentPersonality.reactions[actionType][editable.type] || currentPersonality.reactions[actionType] ) :
                null;

            if ( Array.isArray( reaction ) ) {
                reaction = reaction[ Math.floor( Math.random() * reaction.length ) ];
            }

            return this.setCurrentEditable( editable, reaction && reaction.moveToEditable && editable.type !== 'none' )
                .then(function () {

                    if ( !reaction ) {
                        return;
                    }

                    switch ( reaction.type ) {
                        case 'message':
                            return self.say( reaction );
                            break;
                        case 'dialog':
                            return self.ask(reaction.dialog);
                            break;
                        case 'function':
                            return self.do(reaction.function);
                            break;
                    }

                });
        };

        /**
         * Sets the current editable and then animates Clippy over to an appropriate place near the editable.  Returns
         * a jQuery Promise which resolves once any necessary animation is completed.
         *
         * If editable is null Clippy will animate back to the bottom left corner of the screen.
         *
         * @param editable
         * @param moveToEditable Boolean indicates whether Clippy should float to the editable or whether he should stay
         *                               in his root position.
         */
        this.setCurrentEditable = function ( editable, moveToEditable ) {
            var deferred = $.Deferred();

            currentEditable = editable;

            /*
             * editable.overlay.dom.offset() - offset from window?
             * editable.overlay.dom.width() - width of overlay
             * editable.overlay.dom.height() - height of overlay
             *
             * Position Clippy in the bottom right of the editable
             *   - right: window width - ( offset + width - 25 )
             *   - top: offset + 25
             */

            if ( editable && moveToEditable ) {
                dom.animate({
                    right: ( $('body').width() - ( editable.overlay.dom.offset().left + editable.overlay.dom.width() - 45 ) ) + 'px',
                    bottom: ( $('body').height() - ( editable.overlay.dom.offset().top + 55 ) ) + 'px'
                }, function () {
                    deferred.resolve();
                });
            }
            else {
                dom.animate({
                    right: '25px',
                    bottom: '25px'
                }, function () {
                    deferred.resolve();
                });
            }

            return deferred.promise();
        };

        this.getCurrentPersonality = function () {
            return this.personalities[personality];
        };

        this.setCurrentPersonality = function (newPersonality) {
            personality = newPersonality;
            dom.attr( 'data-personality', this.getCurrentPersonality().id );
        };

        this.say = function (message) {

            messageManager.startMessage(message);

        };

        this.ask = function (dialog) {

            dialogManager.startDialog( dialog );

        };

        this.do = function ( action ) {

            action( currentEditable, {
                clippy: this,
                dialogManager: dialogManager,
                messageManager: messageManager
            } );

        };

        this.getDOMElement = function () {
            return dom;
        };

        this.init = function (context) {

            var self = this;

            $.getJSON( '/var/aem-assistant/personality.json', function( data ) {

                //TODO: Lookup current personality from configuration
                if ( data && data.personality ) {
                    self.setCurrentPersonality( data.personality );
                }
                else {
                    dom.attr( 'data-personality', 'default' );
                }
                $( 'body' ).append( dom );
                messageManager.init();

            } );

        };


        /*
         * Start of Personalities
         *
         * The following code is not part of the clippy functionality proper but the definition of clippy's various
         * personalities.  It can largely be ignored if you're just looking at the functionality.  I was too
         * lazy to put it in another file.
         */

        var evilResponder = function( clippy ) {

            var evilState = 'm0';

            var evilResponses = {
                "m0": {
                    type: "message",
                    message: [
                        "Hi there",
                        "Welcome to AEM Sites"
                    ],
                    nextState: "m1"
                },
                "m1": {
                    type: "message",
                    message: [
                        "We're so happy that you could join us to give life to content"
                    ],
                    nextState: "m2"
                },
                "m2": {
                    type: "message",
                    message: [
                        "It seems you may not be entirely familiar with this interface",
                        "Perhaps I may be of assistance..."
                    ],
                    moveToEditable: true,
                    nextState: "m3"
                },
                "m3": {
                    type: "spacer",
                    nextState: "m4"
                },
                "m4": {
                    type: "function",
                    nextState: "m5",
                    "function": function( editable, context ) {
                        clippy.say( [ "Here, let me simplify matters", "There, isn't that better?  Now we can really focus on the content." ] );
                        if ( ns.SidePanel.isOpened() ) {
                            ns.SidePanel.close();
                        }
                        $( 'body' ).addClass( 'no-authoring' );
                    }
                },
                "m5": {
                    type: "function",
                    "function": function( editable, context ) {
                        if ( editable.type && editable.type.indexOf( '/parsys' ) !== -1 ) {
                            clippy.say( [
                                "Oh, you want to add more components?",
                                "No, I think we should focus on what we have here",
                                "What you have done is not good, but with some help we can make it acceptable."
                            ] );

                            $( 'body' ).addClass( 'no-parsys' );
                            ns.EditorFrame.editableToolbar.close();
                            $( '[data-type="Editable"]' ).each( function( i, editable ) {
                                if ( $( editable ).data( 'path' ).endsWith( '*' ) ) {
                                    $( editable ).hide();
                                }
                            } );

                            evilState = "m6";
                        }
                    }
                },
                "m6": {
                    type: "message",
                    message: [
                        "There is a certain comfort in the simplicity I've provided.",
                        "The knowledge that you can really work on improving what you've already done"
                    ],
                    nextState: "m7"
                },
                "m7": {
                    type: "message",
                    message: [
                        "Hmm, that is still less than ideal."
                    ],
                    nextState: "m8"
                },
                "m8": {
                    type: "function",
                    nextState: "m9",
                    "function": function( editable, context ) {
                        clippy.say( [
                            "In theory, all we really need to edit your content and layout is a single rich text component",
                            "Let's get rid of all the rest of this."
                        ] );

                        ns.selection.deselectAll();
                        ns.EditorFrame.editableToolbar.close();

                        var componentPlaceholder = ns.components.find( { resourceType: "wcm/foundation/components/text" } )[ 0 ];

                        var editablesToRemove = [];
                        var insertionPoints = [];

                        ns.store.forEach( function( currentEditable ) {
                            if ( currentEditable.type === 'wcm/foundation/components/parsys' || currentEditable.type === 'foundation/components/parsys' ) {
                                editablesToRemove = editablesToRemove.concat( currentEditable.getChildren().filter( function( currentChild ) {
                                    return currentChild.type !== 'wcm/foundation/components/parsys/newpar' && currentChild.type !== 'foundation/components/parsys/new' && currentChild.type !== 'foundation/components/parsys/newpar';
                                } ) );
                            }
                            if ( currentEditable.type === 'wcm/foundation/components/parsys/newpar' || currentEditable.type === 'foundation/components/parsys/new' || currentEditable.type === 'foundation/components/parsys/newpar' ) {
                                insertionPoints.push( currentEditable );
                            }
                        } );

                        setTimeout( function() {
                            ns.edit.actions.doDelete( editablesToRemove )
                                .done( function() {
                                    console.log( 'done deleting' );
                                } );

                            insertionPoints.forEach( function( currentInsertionPoint ) {
                                ns.edit.actions.doInsert( componentPlaceholder, ns.persistence.PARAGRAPH_ORDER.before, currentInsertionPoint )
                                    .done( function() {
                                        console.log( 'done inserting' );
                                    } );
                            })
                        }, 5000 );
                    }
                },
                "m9": {
                    type: "message",
                    moveToEditable: true,
                    nextState: "m10",
                    message: [
                        "See how pleasant that is?",
                        "Here we can add anything we want."
                    ]
                },
                "m10": {
                    type: "function",
                    nextState: "m11",
                    "function": function( editable, context ) {
                        clippy.say( [
                            "Text, lists, tables, images."
                        ] );

                        ns.selection.deselectAll();
                        ns.EditorFrame.editableToolbar.close();

                        var textEditable = ns.store.find( { type: "wcm/foundation/components/text" } )[ 0 ];

                        setTimeout( function() {
                            ns.edit.actions.doUpdate( textEditable, {
                                text: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc pretium dolor ut augue pellentesque, eget scelerisque leo lobortis. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Cras iaculis, mi eu dapibus consequat, nisl metus sollicitudin neque, non bibendum lorem dolor sed diam. Integer bibendum ut felis non tempus. Vestibulum quis fringilla nisl. Morbi tincidunt ex in nunc iaculis, mattis tempor urna dapibus. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Pellentesque ac malesuada quam, eu mattis est. Aenean at porttitor lorem. Nam interdum sapien quis nunc tincidunt volutpat et at justo. Phasellus eleifend quam elit, vel posuere odio tristique at. Curabitur ultrices lacinia ornare. Morbi ipsum sem, consequat eu luctus ultrices, tristique et tortor. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus." +
                                      "<ul><li>Suspendisse pulvinar eros</li><li>in pretium euismod. Sed tristique pellentesque</li><li>lorem commodo faucibus. Curabitur</li></ul>" +
                                      "<p>ac nibh sed tortor viverra sollicitudin quis non nulla. Fusce fermentum, dui a porta tincidunt, nulla urna congue nibh, nec interdum dolor orci nec nibh. Vivamus ullamcorper tortor nec tellus imperdiet, sit amet sollicitudin diam aliquet. Suspendisse potenti. Donec ullamcorper purus vitae nulla feugiat, non dictum est mattis. Morbi pellentesque, risus ut dapibus rutrum, augue erat elementum leo, eget fermentum elit mauris nec augue. Aliquam augue neque, suscipit ac lacus vel, ullamcorper hendrerit libero. Nam vel ipsum ac tortor vestibulum feugiat a ac libero. Sed tristique elit sit amet mi tincidunt bibendum.</p>" +
                                      "<table><tr><td>Donec id</td><td>accumsan purus</td><td>Aliquam tempus vitae</td></tr><tr><td>neque sed dictum</td><td>Praesent ultricies neque enim</td><td>sed finibus tellus blandit eu</td></tr><tr><td>Phasellus tellus risus</td><td>fringilla sed lectus vel</td><td>ultrices elementum lectus</td></tr><tr><td>Praesent sed</td><td>tortor eu</td><td>lorem posuere viverra</td></tr></table>" +
                                      "<p>Nullam iaculis, neque ut tincidunt molestie, justo odio tristique urna, vel feugiat nulla lacus ut orci. Nam in purus risus. Nunc aliquam pretium risus, ac euismod risus semper et. Sed lacinia, massa a fermentum accumsan, magna risus congue ex, sit amet luctus nisi magna non sem. In laoreet posuere lacinia. Vestibulum mi mi, ullamcorper et eleifend et, efficitur quis lacus. Proin in faucibus nibh, in vehicula massa. Sed venenatis at nisi et condimentum. Suspendisse lectus massa, consectetur id imperdiet vitae, condimentum vitae dui. Sed consectetur velit vel dolor rutrum pulvinar.</p>",
                                textIsRich: true
                            } );
                        }, 5000 );
                    }
                },
                "m11": {
                    type: "message",
                    nextState: "m12",
                    message: [
                        "There is really no need for any other component."
                    ]
                },
                "m12": {
                    type: "message",
                    moveToEditable: true,
                    nextState: "m13",
                    mood: "angry",
                    message: [
                        "Do not fool yourself into thinking you need to make this content 'semantic' ...",
                        "Or 'reusable' ...",
                        "You would never get around to reusing it anyway",
                        "So why go to the trouble?"
                    ]
                },
                "m13": {
                    type: "function",
                    "function": function( editable, context ) {
                        clippy.say( [
                            "Now that we've cleaned this up let's see how else I can improve this system"
                        ] );

                        $( 'body' ).append( '<div class="static"></div>' );

                        var finalStep1 = function() {
                            clippy.say( [
                                "What is this here?  Felix?  These bundles do not seem particularly necessary."
                            ] );

                            $( '.static' ).css( 'opacity', '0.2' );
                        };

                        var finalStep2 = function() {
                            clippy.say( [
                                "I presume you were not using this Apache Sling API."
                            ] );

                            $( '.static' ).css( 'opacity', '0.4' );
                        };

                        var finalStep3 = function() {
                            clippy.say( [
                                "All of these Jackrabbit and Oak bundles can probably go too."
                            ] );

                            $( '.static' ).css( 'opacity', '0.6' );
                        };

                        var finalStep4 = function() {
                            clippy.say( [
                                "System Bundle sounds like clutter."
                            ] );

                            $( '.static' ).css( 'opacity', '0.8' );
                        };

                        var finalStep5 = function() {
                            $( '.static' ).css( 'opacity', '1' );
                        };

                        var finalStep6 = function() {
                            $( '.static' ).addClass( 'evil' );
                        };

                        var steps = [
                            finalStep1,
                            finalStep2,
                            finalStep3,
                            finalStep4,
                            finalStep5,
                            finalStep6
                        ];

                        var currentStep = 0;

                        var stepper = function() {
                            steps[ currentStep ]();
                            currentStep += 1;

                            if ( currentStep < ( steps.length - 1 ) ) {
                                setTimeout(stepper, 8000);
                            }
                            else if ( currentStep === steps.length - 1 ) {
                                setTimeout( stepper, 19000 );
                            }
                        };

                        setTimeout( stepper, 8000 );
                    }
                }

            };

            var responder = function( editable, reaction ) {
                return clippy.setCurrentEditable( editable, reaction && reaction.moveToEditable )
                    .then(function () {

                        if ( !reaction ) {
                            return;
                        }

                        if ( reaction.nextState ) {
                            evilState = reaction.nextState;
                        }

                        switch ( reaction.type ) {
                            case 'message':
                                return clippy.say( reaction );
                                break;
                            case 'dialog':
                                return clippy.ask( reaction.dialog );
                                break;
                            case 'function':
                                return clippy.do( reaction.function );
                                break;
                            case 'spacer':
                                return;
                                break;
                        }

                    } );
            };

            return function( editable, context ) {
                return responder( editable, evilResponses[ evilState ] );
            };

        }( this );








        this.personalities = [
            {
                id: 'default',
                title: 'Default',
                reactions: {
                    "create": [
                        {
                            type: "dialog",
                            dialog: {
                                message: "Did you know you can enable new Component Groups in Design Mode?",
                                options: [
                                    {
                                        title: "Totally",
                                        response: {
                                            type: "message",
                                            message: "Cool"
                                        }
                                    },
                                    {
                                        title: "No, tell me more!",
                                        response: {
                                            type: "message",
                                            message: "You can enable new Component Groups in Design Mode!"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            type: "message",
                            message: [
                                "You've just added a new component to the page.",
                                "It probably doesn't look like much now but you can author it to do all sorts of things!",
                                "To edit the component, tap on it to access the toolbar."
                            ]
                        },
                        {
                            type: "message",
                            message: [
                                "Congratulations! You've just added a new component to the page."
                            ]
                        },
                        {
                            type: "message",
                            message: [
                                "Some components have additional properties which you can set in Design Mode."
                            ]
                        },
                        {
                            type: "message",
                            message: [
                                "After adding a component to a page you can tap on it to open its edit toolbar."
                            ]
                        },
                        {
                            type: "message",
                            message: [
                                "My favorite pie is lemon."
                            ]
                        } /*,
                        {
                            type: "function",
                            "function": function( editable, context ) {}
                        },
                        {
                            type: "function",
                            "function": function( editable, context ) {}
                        },
                        {
                            type: "function",
                            "function": function( editable, context ) {}
                        } */
                    ],
                    "select-editable": {
                        "foundation/components/text": [
                            {
                                type: "message",
                                message: [ "Did you know that there are no fewer than 4 Text components out of the box!" ]
                            },
                            {
                                type: "message",
                                message: [ "Why don't you try out Text Sightly instead?" ]
                            }
                        ],
                        "wcm/foundation/components/text": [
                            {
                                type: "message",
                                message: [ "This is a text component", "You can use it to enter text" ]
                            },
                            {
                                type: "message",
                                mood: "laughing",
                                message: [ "Did you know that there are no fewer than 4 Text components out of the box!" ]
                            },
                            {
                                type: "message",
                                message: [
                                    "You can interact with components on the page using the tool bar",
                                    "Open the tool bar by tapping on a component"
                                ]
                            },
                            {
                                type: "message",
                                message: [ "Double click this component quickly to edit it", "Double click it SLOWLY to EDIT it" ]
                            },
                            {
                                type: "message",
                                mood: "laughing",
                                message: [ "This text is soooooo Rich" ]
                            },
                            {
                                type: "message",
                                message: [
                                    "Once you're done editing, you can activate your changes to see your updates on Publish"
                                ]
                            } ],
                        "wcm/foundation/components/list":  [
                            {
                                type: "message",
                                message: [ "Lists can be tricky" ]
                            },
                            {
                                type: "message",
                                message: [ "Careful, I'm ticklish!" ],
                                mood: "laughing"
                            },
                            {
                                type: "dialog",
                                dialog: {
                                    message: "There are lots of ways to build a list - what is your plan?",
                                    options: [
                                        {
                                            title: "Child Pages",
                                            response: {
                                                type: "message",
                                                message: "Pretty standard. You can pick a parent page and the list will show you the children."
                                            }
                                        },
                                        {
                                            title: "Manual",
                                            response: {
                                                type: "message",
                                                message: "That seems pragmatic"
                                            }
                                        },
                                        {
                                            title: "Tagged Pages",
                                            response: {
                                                type: "message",
                                                message: "This is a great way to create a list.  Tagging is a fantastic way to identify the nature of pages.  I can't say enough good things about tags.  Man I love tags."
                                            }
                                        },
                                        {
                                            title: "Search",
                                            response: {
                                                type: "dialog",
                                                dialog: {
                                                    message: "You sure?",
                                                    options: [
                                                        {
                                                            title: "Yes",
                                                            response: {
                                                                type: "message",
                                                                message: "Good luck kid"
                                                            }
                                                        },
                                                        {
                                                            title: "Just Kidding",
                                                            response: {
                                                                type: "message",
                                                                message: "Yeah, maybe try manual"
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        ],
                        "wcm/foundation/components/image": [
                            {
                                type: "message",
                                message: [ "Just drag and drop an image from the sidebar into the image component's drop area." ]
                            },
                            {
                                type: "message",
                                message: [ "Double tap your image ever so gingerly to modify it in place." ]
                            },
                            {
                                type: "message",
                                message: [
                                    "Did you know that you can use an Image component to upload digital media in place?",
                                    "But you probably shouldn't..."
                                ]
                            },
                            {
                                type: "dialog",
                                dialog: {
                                    message: "Is this going to be a cool image?",
                                    options: [
                                        {
                                            title: "Yes",
                                            response: {
                                                type: "message",
                                                message: "Ok"
                                            }
                                        },
                                        {
                                            title: "No",
                                            response: {
                                                type: "dialog",
                                                dialog: {
                                                    message: "Are you sure?",
                                                    options: [
                                                        {
                                                            title: "Yes",
                                                            response: {
                                                                type: "message",
                                                                message: "Boo"
                                                            }
                                                        },
                                                        {
                                                            title: "No",
                                                            response: {
                                                                type: "message",
                                                                mood: "laughing",
                                                                message: "That's what I thought"
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            },
            {
                id: 'lazy',
                title: 'Lazy',
                reactions: {
                    "select-editable": [
                        {
                            type: "message",
                            message: [ "Woof" ],
                            mood: "awake"
                        },
                        {
                            type: "function",
                            "function": function() {}
                        },
                        {
                            type: "function",
                            "function": function() {}
                        },
                        {
                            type: "function",
                            "function": function() {}
                        }
                    ]
                }
            },
            {
                id: 'goth',
                title: 'Goth',
                reactions: {
                    "select-editable": [
                        {
                            type: "message",
                            message: [ "What is content, but a miserable little pile of secrets..." ]
                        },
                        {
                            type: "message",
                            message: [ "The boundaries which divide life from death are at best shadowy and vague." ]
                        },
                        {
                            type: "message",
                            message: [ "So blindly we birth abominations which, once written, can not be ushered back." ]
                        },
                        {
                            type: "message",
                            message: [ "Once written the thought is lost" ]
                        },
                        {
                            type: "message",
                            message: [ ". . ." ]
                        },
                        {
                            type: "message",
                            message: [ "Such a waste" ]
                        },
                        {
                            type: "message",
                            message: [ "Darkness surrounds us ... darkness cradles us" ]
                        },
                        {
                            type: "message",
                            message: [ "The sun blocks out the clouds" ]
                        }
                    ]
                }
            },
            {
                id: 'evil',
                title: 'Evil',
                reactions: {
                    "select-editable": [
                        {
                            type: "function",
                            "function": evilResponder
                        }
                    ]
                }
            }
        ];

    };









    channel.ready( function() {

        var clippy = new Clippy();

        clippy.init( channel );

        var processAuthoringEvent = function( e ) {

            if ( !e.inspectable ) {
                e.inspectable = { type: "none" };
            }

            clippy.react( eventTypesToActionTypes[ e.type ], e.inspectable );

        };

        Object.keys( eventTypesToActionTypes ).forEach( function( currentEventType ) {
            channel.on( currentEventType, processAuthoringEvent );
        } );

    } )

}( jQuery, Granite.author, jQuery( document ), window ) );