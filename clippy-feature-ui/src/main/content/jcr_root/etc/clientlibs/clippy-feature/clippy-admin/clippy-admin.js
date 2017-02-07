( function( document, $ ) {

    $( document ).ready( function() {
        $( 'form[action="/var/aem-assistant/personality"]' ).submit( function( e ) {

            var personalityValue = $( 'form[action="/var/aem-assistant/personality"] input[name="personality"]:checked' ).val();

            $.post( '/var/aem-assistant/personality', {
                personality: personalityValue
            } )
                .done( function() {
                    console.log( 'Personality updated to ' + personalityValue );
                } )
                .fail( function() {
                    console.log( 'Personality update failed' );
                } );

            e.preventDefault();

        } );

        $( 'form[action="/var/aem-assistant/personality"] input[value="3"]' ).click( function( e ) {
            var radioLabel = $( e.target ).parent().find( '.coral-Radio-description' );
            radioLabel.text( 'Evil' );

            setTimeout( function() {
                radioLabel.text( 'Happy' );
            }, 100 );
        } );
    } );

} )( document, Granite.$ );