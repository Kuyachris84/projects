# Get the user's input for the filename
file_name = input("File name: ")

# Split the filename into its base name and extension
base_name, file_extension = file_name.rsplit('.', 1)

# Display the file extension
print(f"image/{file_extension}")
