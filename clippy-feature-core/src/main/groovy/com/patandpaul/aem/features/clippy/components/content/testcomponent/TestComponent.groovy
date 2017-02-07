package com.patandpaul.aem.features.clippy.components.content.testcomponent;

import com.citytechinc.cq.component.annotations.Component;
import com.citytechinc.cq.component.annotations.DialogField;
import com.citytechinc.cq.component.annotations.widgets.TextField;
import javax.inject.Inject;

@Component("Test Component")
public class TestComponent {

	@DialogField(fieldLabel = "Test Title", fieldDescription = "Our title")
	@TextField
    @Inject
    private String title;
}
