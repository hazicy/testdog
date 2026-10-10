package com.caseforge.fixture;
import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);
    layout.setPadding(48, 120, 48, 48);
    EditText input = new EditText(this);
    input.setSingleLine(true);
    input.setHint("Name");
    input.setContentDescription("Name");
    input.setId(getResources().getIdentifier("fixture_name", "id", getPackageName()));
    Button button = new Button(this);
    button.setText("Continue");
    button.setId(getResources().getIdentifier("fixture_submit", "id", getPackageName()));
    TextView output = new TextView(this);
    output.setText("Ready");
    output.setId(getResources().getIdentifier("fixture_result", "id", getPackageName()));
    button.setOnClickListener(view -> { output.setText("Welcome " + input.getText()); input.clearFocus(); });
    layout.addView(input); layout.addView(button); layout.addView(output);
    setContentView(layout);
  }
}
